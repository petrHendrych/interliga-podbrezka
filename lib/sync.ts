/* eslint-disable no-console */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */
import sql from './db';

const TEAM_ID = 4844;

interface SyncMatchData {
  homeTeam?: { club?: { id?: number; name?: string } };
  awayTeam?: { club?: { id?: number; name?: string } };
  details?: { date?: string; hall?: { name?: string } };
  league?: { seasonId?: number };
  results?: {
    [key: string]: {
      total?: number;
      players?: {
        player?: { id?: number };
        full?: number;
        clean?: number;
        total?: number;
        faults?: number;
        average?: number;
      }[];
    };
  };
}

async function syncMatch(matchId: number, data: SyncMatchData) {
  try {
    const isHome = data.homeTeam?.club?.id === TEAM_ID;
    const teamKey = isHome ? 'home' : 'away';
    const opponentKey = isHome ? 'away' : 'home';

    const date = data.details?.date || null;
    const seasonId = data.league?.seasonId || null;
    const opponentTeam = opponentKey === 'home' ? data.homeTeam : data.awayTeam;
    const opponent = opponentTeam?.club?.name || 'Unknown';
    const location = data.details?.hall?.name || null;

    // Results in the API
    const teamResults = data.results?.[teamKey] || {};
    const opponentResults = data.results?.[opponentKey] || {};

    const teamTotalScore = teamResults.total || 0;
    const opponentTotalScore = opponentResults.total || 0;

    // 1. Upsert Match
    await sql`
      INSERT INTO matches (external_id, date, opponent, is_home, location, team_total_score, opponent_total_score, season_id, updated_at)
      VALUES (${matchId}, ${date}, ${opponent}, ${isHome}, ${location}, ${teamTotalScore}, ${opponentTotalScore}, ${seasonId}, NOW())
      ON CONFLICT (external_id) DO UPDATE SET
        date = EXCLUDED.date,
        opponent = EXCLUDED.opponent,
        is_home = EXCLUDED.is_home,
        location = EXCLUDED.location,
        team_total_score = EXCLUDED.team_total_score,
        opponent_total_score = EXCLUDED.opponent_total_score,
        season_id = EXCLUDED.season_id,
        updated_at = NOW();
    `;

    // 2. Process Player Results
    const players = teamResults.players || [];
    const playerResultsList = [];

    for (const p of players) {
      const externalPlayerId = p.player?.id;
      if (externalPlayerId) {
        // Find system user linked to this external ID
        const users = await sql`SELECT id FROM users WHERE external_player_id = ${externalPlayerId}`;
        if (users.length > 0) {
          const userId = users[0].id;

          const full = p.full || 0;
          const clean = p.clean || 0;
          const total = p.total || 0;
          const faults = p.faults || 0;
          const avg = p.average || 0;

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
    }

    // Identify worst player (lowest total score)
    let minTotal = Infinity;
    if (playerResultsList.length > 0) {
      // Only consider players who actually played (total > 0)
      const activePlayers = playerResultsList.filter((p) => p.total > 0);
      if (activePlayers.length > 0) {
        minTotal = Math.min(...activePlayers.map((p) => p.total));
      }
    }

    for (const pr of playerResultsList) {
      const isWorstPlayer = pr.total === minTotal && pr.total > 0;
      const isUnder600 = pr.total < 600 && pr.total > 0;

      // Calculate fine (sequential + performance)
      // Special faults are added in the DB update via current value
      let calculatedFine = (pr.faults * (pr.faults + 1)) / 2;
      if (isWorstPlayer) calculatedFine += 1;
      if (isUnder600) calculatedFine += 1;

      // Bonus received
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
    const trainers = await sql`SELECT id FROM users WHERE role = 'trainer'`;
    for (const trainer of trainers) {
      // Condition 1 & 2: Score bonus (exclusive, higher applies)
      let scoreBonusAmount = 0;
      if (teamTotalScore > 3900) {
        scoreBonusAmount = 15;
      } else if (teamTotalScore > 3800) {
        scoreBonusAmount = 10;
      }

      if (scoreBonusAmount > 0) {
        await sql`
          INSERT INTO trainer_payments (match_id, user_id, condition_type, amount)
          VALUES (${matchId}, ${trainer.id}, 'score_bonus', ${scoreBonusAmount})
          ON CONFLICT (match_id, user_id, condition_type) DO UPDATE SET
            amount = EXCLUDED.amount;
        `;
      } else {
        await sql`DELETE FROM trainer_payments WHERE match_id = ${matchId} AND user_id = ${trainer.id} AND condition_type = 'score_bonus'`;
      }

      // Condition 3: Zero faults bonus
      const teamTotalFaults = playerResultsList.reduce((acc, p) => acc + p.faults, 0);
      const allPlayersPresent = playerResultsList.length >= 6;

      if (teamTotalFaults === 0 && allPlayersPresent) {
        await sql`
          INSERT INTO trainer_payments (match_id, user_id, condition_type, amount)
          VALUES (${matchId}, ${trainer.id}, 'zero_faults', 10)
          ON CONFLICT (match_id, user_id, condition_type) DO UPDATE SET
            amount = EXCLUDED.amount;
        `;
      } else {
        await sql`DELETE FROM trainer_payments WHERE match_id = ${matchId} AND user_id = ${trainer.id} AND condition_type = 'zero_faults'`;
      }
    }
  } catch (error) {
    console.error(`Error syncing match ${matchId}:`, error);
  }
}

/**
 * Syncs scraped snapshots into relational tables.
 */
export async function syncData() {
  console.log('Starting data sync from snapshots...');

  try {
    // 1. Get latest match_detail snapshots for each external_id
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

    console.log('Data sync completed successfully.');
  } catch (error) {
    console.error('Data sync failed:', error);
    throw error;
  }
}
