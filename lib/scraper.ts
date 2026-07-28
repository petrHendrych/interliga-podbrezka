/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
import {
  TEAM_ID,
  getTeamResults,
  getMatchDetail,
  getPlayerDetail,
  getPlayerResults,
  getMatchList,
} from './api';
import { ensureSchema, upsertScrapedData, saveSnapshot } from './db-utils';
import { syncData } from './sync';

/**
 * Main scraping job that fetches data from the external API and persists it to Neon DB.
 */
export async function runScrapingJob() {
  console.log('Starting scraping job...');

  try {
    // Ensure database table exists
    await ensureSchema();

    // 1. Fetch match list for Podbrezová
    console.log(`Fetching match list for team ${TEAM_ID}...`);
    try {
      const matchList = await getMatchList(TEAM_ID);
      await upsertScrapedData('match_list', TEAM_ID, matchList);
      await saveSnapshot('match_list', TEAM_ID, matchList);
    } catch (error) {
      console.error(`Failed to fetch match list for team ${TEAM_ID}:`, error);
    }

    // 2. Fetch team results for Podbrezová
    console.log(`Fetching team results for team ${TEAM_ID}...`);
    const teamResults = await getTeamResults(TEAM_ID);
    await upsertScrapedData('team_results', TEAM_ID, teamResults);
    await saveSnapshot('team_results', TEAM_ID, teamResults);

    const playerIds = new Set<number>();
    const matchIds = teamResults.map((m) => m.matchId).filter(Boolean);

    // 2. Fetch match details and collect player IDs
    for (const matchId of matchIds) {
      try {
        console.log(`Fetching match detail for ${matchId}...`);
        const matchDetail = await getMatchDetail(matchId);
        await upsertScrapedData('match_detail', matchId, matchDetail);
        await saveSnapshot('match_detail', matchId, matchDetail);

        // Extract players from Podbrezová lineup in this match
        const isHome = matchDetail.homeTeam?.club?.id === TEAM_ID;
        const teamKey = isHome ? 'home' : 'away';
        const lineup = matchDetail.lineUp?.[teamKey] || [];

        lineup.forEach((p) => {
          if (p.player?.id) {
            playerIds.add(p.player.id);
          }
        });

        // Small delay to avoid rate limiting
        await new Promise((resolve) => {
          setTimeout(resolve, 500);
        });
      } catch (error) {
        console.error(`Failed to scrape match ${matchId}:`, error);
      }
    }

    // 3. Fetch player details and results for all identified players
    for (const playerId of Array.from(playerIds)) {
      try {
        console.log(`Fetching data for player ${playerId}...`);

        const playerDetail = await getPlayerDetail(playerId);
        await upsertScrapedData('player_detail', playerId, playerDetail);
        await saveSnapshot('player_detail', playerId, playerDetail);

        const playerResults = await getPlayerResults(playerId);
        await upsertScrapedData('player_results', playerId, playerResults);
        await saveSnapshot('player_results', playerId, playerResults);

        await new Promise((resolve) => {
          setTimeout(resolve, 500);
        });
      } catch (error) {
        console.error(`Failed to scrape player ${playerId}:`, error);
      }
    }

    console.log('Scraping job completed successfully. Triggering data sync...');
    await syncData();
    console.log('All jobs completed.');
  } catch (error) {
    console.error('Scraping job failed:', error);
    throw error;
  }
}
