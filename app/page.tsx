import Link from 'next/link';
import {
  TeamResult, MatchDetail, PlayerDetail,
} from '@/lib/api';
import { getScrapedData } from '@/lib/db-utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';

type FetchDataResult =
  | { teamResults: TeamResult[]; latestMatch: null }
  | {
    teamResults: TeamResult[];
    latestMatch: TeamResult;
    matchDetail: MatchDetail;
    players: PlayerDetail[];
  };

async function fetchData(teamId: number): Promise<FetchDataResult> {
  // 1. Fetch team results from database
  const teamResults = await getScrapedData<TeamResult[]>('team_results', teamId);

  if (!teamResults || teamResults.length === 0) {
    return { teamResults: [], latestMatch: null };
  }

  const latestMatch = teamResults[0];
  const { matchId } = latestMatch;

  // 2. Fetch match detail from database
  const matchDetail = await getScrapedData<MatchDetail>('match_detail', matchId);

  if (!matchDetail) {
    return { teamResults, latestMatch: null };
  }

  // 3. Determine if team 4844 is home or away
  const isHome = matchDetail.homeTeam.club.id === teamId;
  const teamKey = isHome ? 'home' : 'away';

  // 4. Extract player IDs
  const lineup = matchDetail.lineUp[teamKey];
  const playerIds: number[] = lineup
    .map((p) => p.player?.id)
    .filter((id: number | undefined): id is number => id !== undefined);

  // 5. Fetch player details for each player from database
  const players = await Promise.all(
    playerIds.map(async (id) => {
      const detail = await getScrapedData<PlayerDetail>('player_detail', id);
      return detail;
    }),
  );

  // Filter out any players that weren't found in the DB
  const validPlayers = players.filter((p): p is PlayerDetail => p !== null);

  return {
    teamResults,
    latestMatch,
    matchDetail,
    players: validPlayers,
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
        <div className="bg-red-950 border border-red-900 p-4 rounded-lg">
          <p className="text-red-300">{errorMsg}</p>
          <p className="mt-2 text-sm text-red-400">Check your X_APP_ACCESSTOKEN in .env.local</p>
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

  const { players } = data;

  return (
    <main className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-8 text-center sm:text-left">Our Team</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {players.map((player) => (
          <Link key={player.id} href={`/player/${player.id}`} className="block transition-transform hover:scale-[1.02] active:scale-[0.98]">
            <Card className="overflow-hidden hover:border-primary transition-colors">
              <CardContent className="p-0">
                <div className="flex items-center p-4 gap-4">
                  <Avatar className="w-16 h-16 border-2 border-muted">
                    <AvatarImage src="/players/3009.JPG" alt={`${player.firstName} ${player.lastName}`} />
                    <AvatarFallback>
                      {player.firstName?.[0]}
                      {player.lastName?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="font-bold text-lg leading-tight">
                      {player.firstName}
                      <br />
                      {player.lastName}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">View Detail</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
