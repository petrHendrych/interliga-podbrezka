import {
  getTeamResults, getMatchDetail, getPlayerResults, TeamResult, MatchDetail, PlayerResult,
} from '@/lib/api';

type FetchDataResult =
  | { teamResults: TeamResult[]; latestMatch: null }
  | {
    teamResults: TeamResult[];
    latestMatch: TeamResult;
    matchDetail: MatchDetail;
    playerIds: number[];
    allPlayerResults: PlayerResult[];
  };

async function fetchData(teamId: number): Promise<FetchDataResult> {
  // 1. Fetch team results
  const teamResults = await getTeamResults(teamId);
  const latestMatch = teamResults[0];

  if (!latestMatch) {
    return { teamResults, latestMatch: null };
  }

  const matchId = latestMatch.id;

  // 2. Fetch match detail
  const matchDetail = await getMatchDetail(matchId);

  // 3. Determine if team 4844 is home or away
  const isHome = matchDetail.teams.home.club.id === teamId;
  const teamKey = isHome ? 'home' : 'away';

  // 4. Extract player IDs
  const { players } = matchDetail.results[teamKey];
  const playerIds: number[] = players
    .map((p: { player?: { id: number } }) => p.player?.id)
    .filter((id: number | undefined): id is number => id !== undefined);

  // 5. Fetch player results for each player
  const allPlayerResults = await Promise.all(playerIds.map((id) => getPlayerResults(id)));

  return {
    teamResults,
    latestMatch,
    matchDetail,
    playerIds,
    allPlayerResults,
  };
}

export default async function Home() {
  const teamId = 4844;
  let data;
  let errorMsg;

  try {
    data = await fetchData(teamId);
  } catch (e: unknown) {
    errorMsg = e instanceof Error ? e.message : 'An unknown error occurred';
  }

  if (errorMsg) {
    return (
      <main className="p-4 md:p-8 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4 text-red-600">Error fetching data</h1>
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-4 rounded-lg">
          <p className="text-red-700 dark:text-red-300">{errorMsg}</p>
          <p className="mt-2 text-sm text-red-500 dark:text-red-400">Check your X_APP_ACCESSTOKEN in .env.local</p>
        </div>
      </main>
    );
  }

  if (!data || !data.latestMatch) {
    return (
      <main className="p-4 md:p-8 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Podbrezová - Interliga</h1>
        <p>
          No match results found for team
          {teamId}
        </p>
      </main>
    );
  }

  const {
    teamResults, latestMatch, matchDetail, playerIds, allPlayerResults,
  } = data;

  return (
    <main className="p-4 md:p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Podbrezová - Interliga Scraper</h1>

      <div className="space-y-8">
        <section>
          <h2 className="text-xl font-semibold mb-2">
            Team Results (Team
            {teamId}
            )
          </h2>
          <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-x-auto">
            <pre className="text-xs text-gray-800 dark:text-gray-200">{JSON.stringify(teamResults, null, 2)}</pre>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">
            Latest Match Detail (ID:
            {latestMatch.id}
            )
          </h2>
          <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-x-auto">
            <pre className="text-xs text-gray-800 dark:text-gray-200">{JSON.stringify(matchDetail, null, 2)}</pre>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Players Results</h2>
          <div className="space-y-4">
            {allPlayerResults.map((playerRes, index) => (
              <div key={playerIds[index]} className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-x-auto">
                <h3 className="font-mono text-sm font-bold mb-2">
                  Player ID:
                  {playerIds[index]}
                </h3>
                <pre className="text-xs text-gray-800 dark:text-gray-200">{JSON.stringify(playerRes, null, 2)}</pre>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
