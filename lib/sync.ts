/* eslint-disable no-console */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */
import sql from './db';
import { getAllTeamIds } from './season-config';

export interface SyncMatchData {
  id?: number;
  startDate?: string;
  hall?: { name?: string };
  details?: { date?: string; hall?: { name?: string } };
  league?: { name?: string; seasonId?: number };
  homeTeam?: { id?: number; name?: string; club?: { id?: number; name?: string } };
  awayTeam?: { id?: number; name?: string; club?: { id?: number; name?: string } };
  results?: {
    [key: string]: {
      total?: number;
      players?: {
        player?: { id?: number; firstName?: string; lastName?: string; name?: string };
        full?: number;
        clean?: number;
        total?: number;
        faults?: number;
        average?: number;
      }[];
    };
  };
  lineUp?: {
    [key: string]: {
      player?: { id?: number; firstName?: string; lastName?: string; name?: string };
      full?: number;
      clean?: number;
      total?: number;
      faults?: number;
      average?: number;
    }[];
  };
}

export async function syncMatch(matchId: number, data: SyncMatchData) {
  try {
    const homeClubId = data.homeTeam?.club?.id;
    const homeTeamId = data.homeTeam?.id;
    const homeName = data.homeTeam?.club?.name || data.homeTeam?.name || '';
    const isHome = homeClubId === 649
      || (homeTeamId != null && getAllTeamIds().includes(homeTeamId))
      || homeName.includes('Podbrezová');

    const date = data.details?.date || data.startDate || null;
    const seasonId = data.league?.seasonId || null;
    const leagueName = data.league?.name || null;
    const opponentTeam = isHome ? data.awayTeam : data.homeTeam;
    const opponent = opponentTeam?.club?.name || opponentTeam?.name || 'Unknown';
    const location = data.details?.hall?.name || data.hall?.name || null;

    const teamKey = isHome ? 'home' : 'away';
    const opponentKey = isHome ? 'away' : 'home';

    const teamLineup = data.lineUp?.[teamKey] || data.results?.[teamKey]?.players || [];
    const opponentLineup = data.lineUp?.[opponentKey] || data.results?.[opponentKey]?.players || [];

    const teamTotalScore = data.results?.[teamKey]?.total
      || teamLineup.reduce((sum, p) => sum + (p.total || 0), 0);
    const opponentTotalScore = data.results?.[opponentKey]?.total
      || opponentLineup.reduce((sum, p) => sum + (p.total || 0), 0);

    // 1. Upsert Match
    await sql`
      INSERT INTO matches (external_id, date, opponent, is_home, location, team_total_score, opponent_total_score, season_id, league_name, updated_at)
      VALUES (${matchId}, ${date}, ${opponent}, ${isHome}, ${location}, ${teamTotalScore}, ${opponentTotalScore}, ${seasonId}, ${leagueName}, NOW())
      ON CONFLICT (external_id) DO UPDATE SET
        date = EXCLUDED.date,
        opponent = EXCLUDED.opponent,
        is_home = EXCLUDED.is_home,
        location = EXCLUDED.location,
        team_total_score = EXCLUDED.team_total_score,
        opponent_total_score = EXCLUDED.opponent_total_score,
        season_id = EXCLUDED.season_id,
        league_name = EXCLUDED.league_name,
        updated_at = NOW();
    `;

    // 2. Process Player Results & Auto-Provision Users
    const playerResultsList = [];

    for (const p of teamLineup) {
      const externalPlayerId = p.player?.id;
      if (externalPlayerId) {
        let userId: string;
        const existingUsers = await sql`SELECT id FROM users WHERE external_player_id = ${externalPlayerId}`;

        if (existingUsers.length > 0) {
          userId = String(existingUsers[0].id);
        } else {
          const playerFirstName = p.player?.firstName || '';
          const playerLastName = p.player?.lastName || '';
          const name = [playerFirstName, playerLastName].filter(Boolean).join(' ') || p.player?.name || `Player ${externalPlayerId}`;

          const createdUsers = await sql`
            INSERT INTO users (name, external_player_id, role, is_approved)
            VALUES (${name}, ${externalPlayerId}, 'player', true)
            ON CONFLICT (external_player_id) DO UPDATE SET name = EXCLUDED.name
            RETURNING id;
          `;
          userId = String(createdUsers[0].id);
        }

        const full = p.full || 0;
        const clean = p.clean || 0;
        const total = p.total || 0;
        const faults = p.faults || 0;
        const avg = p.average || (total > 0 ? Math.round((total / 4) * 10) / 10 : 0);

        playerResultsList.push({
          userId,
          full,
          clean,
          total,
          faults,
          avg,
          externalPlayerId,
        });
      }
    }

    // Identify worst player (lowest total score among active players)
    let minTotal = Infinity;
    const activePlayers = playerResultsList.filter((p) => p.total > 0);
    if (activePlayers.length > 0) {
      minTotal = Math.min(...activePlayers.map((p) => p.total));
    }

    for (const pr of playerResultsList) {
      const isWorstPlayer = pr.total === minTotal && pr.total > 0;
      const isUnder600 = pr.total < 600 && pr.total > 0;

      let calculatedFine = (pr.faults * (pr.faults + 1)) / 2;
      if (isWorstPlayer) calculatedFine += 1;
      if (isUnder600) calculatedFine += 1;

      const bonusReceived = pr.total > 700 ? 30 : 0;

      await sql`
        INSERT INTO match_player_results (
          match_id, user_id, "full", clean, total, avg, faults, 
          is_worst_player, is_under_600, calculated_fine, bonus_received
        )
        VALUES (
          ${matchId}, ${pr.userId}, ${pr.full}, ${pr.clean}, ${pr.total}, ${pr.avg}, ${pr.faults},
          ${isWorstPlayer}, ${isUnder600}, ${calculatedFine}, ${bonusReceived}
        )
        ON CONFLICT (match_id, user_id) DO UPDATE SET
          "full" = EXCLUDED."full",
          clean = EXCLUDED.clean,
          total = EXCLUDED.total,
          avg = EXCLUDED.avg,
          faults = EXCLUDED.faults,
          is_worst_player = EXCLUDED.is_worst_player,
          is_under_600 = EXCLUDED.is_under_600,
          calculated_fine = ((${pr.faults} * (${pr.faults} + 1)) / 2) + 
                             (CASE WHEN EXCLUDED.is_worst_player THEN 1 ELSE 0 END) + 
                             (CASE WHEN EXCLUDED.is_under_600 THEN 1 ELSE 0 END) +
                             (COALESCE(match_player_results.special_faults_count, 0) * 5),
          bonus_received = EXCLUDED.bonus_received;
      `;
    }

    // 3. Trainer Payments
    const trainers = await sql`SELECT id FROM users WHERE role = 'trainer' AND is_approved = true`;
    for (const trainer of trainers) {
      const trainerId = String(trainer.id);

      // Score bonus
      let scoreBonusAmount = 0;
      if (teamTotalScore > 3900) {
        scoreBonusAmount = 15;
      } else if (teamTotalScore > 3800) {
        scoreBonusAmount = 10;
      }

      if (scoreBonusAmount > 0) {
        await sql`
          INSERT INTO trainer_payments (match_id, user_id, condition_type, amount)
          VALUES (${matchId}, ${trainerId}, 'score_bonus', ${scoreBonusAmount})
          ON CONFLICT (match_id, user_id, condition_type) DO UPDATE SET amount = EXCLUDED.amount;
        `;
      } else {
        await sql`DELETE FROM trainer_payments WHERE match_id = ${matchId} AND user_id = ${trainerId} AND condition_type = 'score_bonus'`;
      }

      // Zero faults bonus
      const teamTotalFaults = playerResultsList.reduce((acc, p) => acc + p.faults, 0);
      const activePlayersCount = playerResultsList.filter((p) => p.total > 0).length;

      if (teamTotalFaults === 0 && activePlayersCount >= 6) {
        await sql`
          INSERT INTO trainer_payments (match_id, user_id, condition_type, amount)
          VALUES (${matchId}, ${trainerId}, 'zero_faults', 10)
          ON CONFLICT (match_id, user_id, condition_type) DO UPDATE SET amount = EXCLUDED.amount;
        `;
      } else {
        await sql`DELETE FROM trainer_payments WHERE match_id = ${matchId} AND user_id = ${trainerId} AND condition_type = 'zero_faults'`;
      }

      // Elite player bonus (10€ per player scoring > 700)
      const elitePlayersCount = playerResultsList.filter((p) => p.total > 700).length;
      if (elitePlayersCount > 0) {
        const eliteBonusAmount = elitePlayersCount * 10;
        await sql`
          INSERT INTO trainer_payments (match_id, user_id, condition_type, amount)
          VALUES (${matchId}, ${trainerId}, 'elite_player', ${eliteBonusAmount})
          ON CONFLICT (match_id, user_id, condition_type) DO UPDATE SET amount = EXCLUDED.amount;
        `;
      } else {
        await sql`DELETE FROM trainer_payments WHERE match_id = ${matchId} AND user_id = ${trainerId} AND condition_type = 'elite_player'`;
      }
    }
  } catch (error) {
    console.error(`Error syncing match ${matchId}:`, error);
  }
}

/**
 * Recalculates faultless streak fines (10€ for 5th, 6th, 7th... consecutive game with 0 faults)
 */
export async function recalculateFaultlessStreaks() {
  const results = await sql`
    SELECT 
      mpr.match_id,
      mpr.user_id,
      mpr.faults,
      mpr.is_worst_player,
      mpr.is_under_600,
      COALESCE(mpr.special_faults_count, 0) as special_faults_count,
      m.date
    FROM match_player_results mpr
    JOIN matches m ON mpr.match_id = m.external_id
    ORDER BY mpr.user_id, COALESCE(m.date, '1970-01-01'::timestamp) ASC, mpr.match_id ASC;
  `;

  const playerResultsMap = new Map<string, typeof results>();
  for (const row of results) {
    const userId = String(row.user_id);
    if (!playerResultsMap.has(userId)) {
      playerResultsMap.set(userId, []);
    }
    playerResultsMap.get(userId)!.push(row);
  }

  for (const [userId, userRows] of playerResultsMap.entries()) {
    let streak = 0;
    for (const r of userRows) {
      const faults = Number(r.faults || 0);
      if (faults === 0) {
        streak += 1;
      } else {
        streak = 0;
      }

      const streakFine = streak >= 5 ? 10 : 0;
      const sequentialFine = (faults * (faults + 1)) / 2;
      const worstFine = r.is_worst_player ? 1 : 0;
      const under600Fine = r.is_under_600 ? 1 : 0;
      const specialFine = Number(r.special_faults_count) * 5;

      const totalFine = sequentialFine + worstFine + under600Fine + specialFine + streakFine;

      await sql`
        UPDATE match_player_results
        SET calculated_fine = ${totalFine}
        WHERE match_id = ${r.match_id} AND user_id = ${userId};
      `;
    }
  }
}

export async function syncAllPlayerResultsSnapshots() {
  const playerSnapshots = await sql`
    SELECT DISTINCT ON (external_id) external_id, data, scraped_at
    FROM scraped_snapshots
    WHERE type = 'player_results'
    ORDER BY external_id, scraped_at DESC;
  `;

  if (playerSnapshots.length === 0) return;

  const existingUsers = await sql`
    SELECT id, external_player_id FROM users WHERE external_player_id IS NOT NULL;
  `;
  const userMap = new Map<number, string>();
  existingUsers.forEach((u) => {
    userMap.set(Number(u.external_player_id), String(u.id));
  });

  const matchesMap = new Map<number, {
    externalId: number;
    date: string | null;
    opponent: string;
    isHome: boolean;
    location: string | null;
    leagueName: string | null;
    seasonId: number | null;
  }>();

  const playerResultsToUpsert: Array<{
    matchId: number;
    userId: string;
    full: number;
    clean: number;
    total: number;
    avg: number;
    faults: number;
    isUnder600: boolean;
    bonusReceived: number;
    teamId: number;
  }> = [];

  for (const snapshot of playerSnapshots) {
    const externalPlayerId = Number(snapshot.external_id);
    const playerResults = snapshot.data as unknown as Array<{
      full?: number;
      clean?: number;
      total?: number;
      faults?: number;
      average?: number;
      teamId?: number;
      player?: { firstName?: string; lastName?: string; name?: string };
      match?: {
        id?: number;
        startDate?: string;
        created?: string;
        hall?: { name?: string };
        league?: { name?: string; seasonId?: number };
        homeTeam?: {
          id?: number;
          name?: string;
          clubId?: number;
          club?: { id?: number; name?: string };
        };
        awayTeam?: {
          id?: number;
          name?: string;
          clubId?: number;
          club?: { id?: number; name?: string };
        };
      };
    }>;

    if (externalPlayerId && Array.isArray(playerResults)) {
      const resultsForPodbrezova = [];

      for (const item of playerResults) {
        const { match } = item;
        if (match && match.id) {
          const matchId = Number(match.id);
          const date = match.startDate || match.created || null;
          const homeClubId = match.homeTeam?.clubId || match.homeTeam?.club?.id;
          const homeTeamId = match.homeTeam?.id;
          const homeName = match.homeTeam?.name || match.homeTeam?.club?.name || '';
          const isHome = homeClubId === 649
            || (homeTeamId != null && getAllTeamIds().includes(homeTeamId))
            || homeName.includes('Podbrezová');

          const opponentTeam = isHome ? match.awayTeam : match.homeTeam;
          const opponent = opponentTeam?.name || opponentTeam?.club?.name || 'Unknown';
          const location = match.hall?.name || null;
          const leagueName = match.league?.name || null;
          // seasonId might be at match.league.seasonId or just captured during other syncs
          const seasonId = match.league?.seasonId || null;

          // Only sync results if the player was playing for Podbrezová in this match
          const playerTeamId = Number(item.teamId);
          const podbrezovaATeamIds = getAllTeamIds();
          const mainPlayerIds = [170512, 169214, 169215, 170511, 19728, 20299];

          const playerTeam = (match.homeTeam?.id === playerTeamId)
            ? match.homeTeam
            : match.awayTeam;
          const playerTeamName = playerTeam?.name || playerTeam?.club?.name || '';
          const isPodbrezovaMatch = playerTeamName.includes('Podbrezová');

          if (isPodbrezovaMatch && matchId) {
            const isMainPlayer = mainPlayerIds.includes(externalPlayerId);
            const isATeamMatch = podbrezovaATeamIds.includes(playerTeamId);

            // Sync all Podbrezová matches for main players,
            // but only A-team matches for others (like Jozef Petráš)
            if (isMainPlayer || isATeamMatch) {
              if (!matchesMap.has(matchId)) {
                matchesMap.set(matchId, {
                  externalId: matchId,
                  date,
                  opponent,
                  isHome,
                  location,
                  leagueName,
                  seasonId,
                });
              }

              const full = Number(item.full || 0);
              const clean = Number(item.clean || 0);
              const total = Number(item.total || 0);
              const faults = Number(item.faults || 0);
              const avg = Number(
                item.average || (total > 0 ? Math.round((total / 4) * 10) / 10 : 0),
              );

              const isUnder600 = total < 600 && total > 0;
              // Bonus is 30€ from bank + 10€ from trainer (total 40€)
              // We include all 40€ here because we also count the trainer's 10€ in the bank inflow
              const bonusReceived = total > 700 ? 40 : 0;

              resultsForPodbrezova.push({
                matchId,
                full,
                clean,
                total,
                avg,
                faults,
                isUnder600,
                bonusReceived,
                teamId: playerTeamId,
              });
            }
          }
        }
      }

      if (resultsForPodbrezova.length > 0) {
        let userId = userMap.get(externalPlayerId);
        if (!userId) {
          const firstItem = playerResults.find((p) => p.player);
          const name = firstItem?.player
            ? `${firstItem.player.firstName || ''} ${firstItem.player.lastName || ''}`.trim()
            : `Player ${externalPlayerId}`;
          const createdUsers = await sql`
            INSERT INTO users (name, external_player_id, role, is_approved)
            VALUES (${name}, ${externalPlayerId}, 'player', true)
            ON CONFLICT (external_player_id) DO UPDATE SET name = EXCLUDED.name
            RETURNING id;
          `;
          userId = String(createdUsers[0].id);
          userMap.set(externalPlayerId, userId);
        }

        for (const res of resultsForPodbrezova) {
          playerResultsToUpsert.push({
            ...res,
            userId,
          });
        }
      }
    }
  }

  // Upsert matches in concurrent batches
  const matchEntries = Array.from(matchesMap.values());
  const matchBatchSize = 25;
  for (let i = 0; i < matchEntries.length; i += matchBatchSize) {
    const chunk = matchEntries.slice(i, i + matchBatchSize);
    await Promise.all(
      chunk.map((m) => sql`
        INSERT INTO matches (external_id, date, opponent, is_home, location, league_name, season_id, updated_at)
        VALUES (${m.externalId}, ${m.date}, ${m.opponent}, ${m.isHome}, ${m.location}, ${m.leagueName}, ${m.seasonId}, NOW())
        ON CONFLICT (external_id) DO UPDATE SET
          date = COALESCE(EXCLUDED.date, matches.date),
          opponent = COALESCE(EXCLUDED.opponent, matches.opponent),
          is_home = COALESCE(EXCLUDED.is_home, matches.is_home),
          location = COALESCE(EXCLUDED.location, matches.location),
          league_name = COALESCE(EXCLUDED.league_name, matches.league_name),
          season_id = COALESCE(EXCLUDED.season_id, matches.season_id),
          updated_at = NOW();
      `),
    );
  }

  // Upsert player results in concurrent batches
  const prBatchSize = 25;
  for (let i = 0; i < playerResultsToUpsert.length; i += prBatchSize) {
    const chunk = playerResultsToUpsert.slice(i, i + prBatchSize);
    await Promise.all(
      chunk.map((pr) => sql`
        INSERT INTO match_player_results (
          match_id, user_id, "full", clean, total, avg, faults, 
          is_under_600, calculated_fine, bonus_received, team_id
        )
        VALUES (
          ${pr.matchId}, ${pr.userId}, ${pr.full}, ${pr.clean}, ${pr.total}, ${pr.avg}, ${pr.faults},
          ${pr.isUnder600},
          ((${pr.faults} * (${pr.faults} + 1)) / 2) + (CASE WHEN ${pr.isUnder600} THEN 1 ELSE 0 END),
          ${pr.bonusReceived}, ${pr.teamId}
        )
        ON CONFLICT (match_id, user_id) DO UPDATE SET
          "full" = EXCLUDED."full",
          clean = EXCLUDED.clean,
          total = EXCLUDED.total,
          avg = EXCLUDED.avg,
          faults = EXCLUDED.faults,
          is_under_600 = EXCLUDED.is_under_600,
          calculated_fine = ((${pr.faults} * (${pr.faults} + 1)) / 2) + 
                             (CASE WHEN match_player_results.is_worst_player THEN 1 ELSE 0 END) + 
                             (CASE WHEN EXCLUDED.is_under_600 THEN 1 ELSE 0 END) +
                             (COALESCE(match_player_results.special_faults_count, 0) * 5),
          bonus_received = EXCLUDED.bonus_received,
          team_id = EXCLUDED.team_id;
      `),
    );
  }
}

/**
 * Syncs scraped snapshots into relational tables.
 */
export async function syncData() {
  console.log('Starting data sync from snapshots...');

  try {
    const matchSnapshots = await sql`
      SELECT DISTINCT ON (external_id) external_id, data, scraped_at
      FROM scraped_snapshots
      WHERE type = 'match_detail'
      ORDER BY external_id, scraped_at DESC;
    `;

    console.log(`Found ${matchSnapshots.length} match snapshots to sync.`);

    for (const snapshot of matchSnapshots) {
      await syncMatch(Number(snapshot.external_id), snapshot.data as SyncMatchData);
    }

    console.log('Syncing player results snapshots...');
    await syncAllPlayerResultsSnapshots();

    console.log('Recalculating faultless streaks...');
    await recalculateFaultlessStreaks();

    console.log('Data sync completed successfully.');
  } catch (error) {
    console.error('Data sync failed:', error);
    throw error;
  }
}
