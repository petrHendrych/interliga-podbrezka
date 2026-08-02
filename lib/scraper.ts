/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
import {
  getTeamResults,
  getMatchDetail,
  getPlayerDetail,
  getPlayerResults,
  getMatchList,
  PlayerResult,
} from './api';
import {
  ensureSchema,
  upsertScrapedData,
  saveSnapshot,
  tryAcquireLock,
  releaseLock,
} from './db-utils';
import { syncData } from './sync';
import { getAllTeamIds, SEASONS_CONFIG } from './season-config';

/**
 * Main scraping job that fetches data from the external API and persists it to Neon DB.
 */
export async function runScrapingJob(source: 'cron' | 'manual' = 'manual') {
  console.log(`Starting ${source} scraping job...`);

  const lockAcquired = await tryAcquireLock('scraping_job');
  if (!lockAcquired) {
    console.warn(`Scraping job already running (source: ${source}). Skipping this run.`);
    return;
  }

  try {
    // Ensure database table exists
    await ensureSchema();

    const teamIds = getAllTeamIds();
    const matchIdsSet = new Set<number>();

    // 1 & 2. Fetch match list and team results for all team IDs across configured seasons
    for (const teamId of teamIds) {
      console.log(`Fetching match list for team ${teamId}...`);
      try {
        const matchList = await getMatchList(teamId);
        await upsertScrapedData('match_list', teamId, matchList);
        await saveSnapshot('match_list', teamId, matchList);
      } catch (error) {
        console.error(`Failed to fetch match list for team ${teamId}:`, error);
      }

      console.log(`Fetching team results for team ${teamId}...`);
      try {
        const teamResults = await getTeamResults(teamId);
        await upsertScrapedData('team_results', teamId, teamResults);
        await saveSnapshot('team_results', teamId, teamResults);
        teamResults.forEach((m) => {
          if (m.matchId) {
            matchIdsSet.add(m.matchId);
          }
        });
      } catch (error) {
        console.error(`Failed to fetch team results for team ${teamId}:`, error);
      }
    }

    const playerIds = new Set<number>();

    // 3. Fetch match details and collect player IDs in batches of 3
    const matchIds = Array.from(matchIdsSet);
    const matchBatchSize = 3;

    for (let i = 0; i < matchIds.length; i += matchBatchSize) {
      const chunk = matchIds.slice(i, i + matchBatchSize);
      console.log(`Fetching match details chunk ${Math.floor(i / matchBatchSize) + 1}/${Math.ceil(matchIds.length / matchBatchSize)}...`);

      await Promise.all(chunk.map(async (matchId) => {
        try {
          console.log(`Fetching match detail for ${matchId}...`);
          const matchDetail = await getMatchDetail(matchId);
          await upsertScrapedData('match_detail', matchId, matchDetail);
          await saveSnapshot('match_detail', matchId, matchDetail);

          // Extract players from Podbrezová lineup in this match
          const homeClubId = matchDetail.homeTeam?.club?.id;
          const homeTeamId = matchDetail.homeTeam?.id;
          const isHome = (homeClubId && teamIds.includes(homeClubId))
            || (homeTeamId && teamIds.includes(homeTeamId));
          const teamKey = isHome ? 'home' : 'away';
          const lineup = matchDetail.lineUp?.[teamKey] || [];

          lineup.forEach((p) => {
            if (p.player?.id) {
              playerIds.add(p.player.id);
            }
          });
        } catch (error) {
          console.error(`Failed to scrape match ${matchId}:`, error);
        }
      }));

      // Delay between batches to avoid rate limiting
      await new Promise((resolve) => {
        setTimeout(resolve, 1000);
      });
    }

    // 4. Fetch player details and results for all identified players in batches of 3
    const playerIdsList = Array.from(playerIds);
    const playerBatchSize = 3;

    for (let i = 0; i < playerIdsList.length; i += playerBatchSize) {
      const chunk = playerIdsList.slice(i, i + playerBatchSize);
      console.log(`Fetching player details chunk ${Math.floor(i / playerBatchSize) + 1}/${Math.ceil(playerIdsList.length / playerBatchSize)}...`);

      await Promise.all(chunk.map(async (playerId) => {
        try {
          console.log(`Fetching data for player ${playerId}...`);

          const playerDetail = await getPlayerDetail(playerId);
          await upsertScrapedData('player_detail', playerId, playerDetail);
          await saveSnapshot('player_detail', playerId, playerDetail);

          const allPlayerResults: PlayerResult[] = [];
          for (const season of SEASONS_CONFIG) {
            try {
              const playerResults = await getPlayerResults(playerId, season.id);
              if (Array.isArray(playerResults)) {
                allPlayerResults.push(...playerResults);
              }
            } catch (err) {
              console.error(`Failed to scrape player ${playerId} for season ${season.id}:`, err);
            }
          }

          await upsertScrapedData('player_results', playerId, allPlayerResults);
          await saveSnapshot('player_results', playerId, allPlayerResults);
        } catch (error) {
          console.error(`Failed to scrape player ${playerId}:`, error);
        }
      }));

      await new Promise((resolve) => {
        setTimeout(resolve, 1000);
      });
    }

    console.log(`Scraping job (${source}) completed successfully. Triggering data sync...`);
    await syncData();
    console.log(`All jobs (${source}) completed.`);
  } catch (error) {
    console.error(`Scraping job (${source}) failed:`, error);
    throw error;
  } finally {
    await releaseLock('scraping_job');
  }
}
