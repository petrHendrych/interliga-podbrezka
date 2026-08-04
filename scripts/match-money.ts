/* eslint-disable no-console */
import * as dotenv from 'dotenv';

// `quiet` keeps the dotenv banner off stdout so every command emits parseable JSON.
dotenv.config({ path: '.env.local', quiet: true });

const USAGE = `Usage:
  npx tsx scripts/match-money.ts list [--limit N] [--unpaid-only]
  npx tsx scripts/match-money.ts sheet --match-id <id>
  npx tsx scripts/match-money.ts apply --match-id <id> [--dry-run]   # payload JSON on stdin

apply payload:
  {
    "players": [
      { "userId": "<uuid>", "fullFaults": 1, "secondToLastFaults": 0,
        "isPaid": true, "isBonusPaid": false }
    ],
    "trainerPayments": [ { "id": 8, "isPaid": true } ]
  }
Omitted fields keep their current value.`;

function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function requireMatchId(args: string[]): number {
  const raw = flagValue(args, '--match-id');
  const matchId = Number(raw);
  if (!raw || !Number.isFinite(matchId)) {
    console.error('Error: --match-id <id> is required');
    process.exit(1);
  }
  return matchId;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    console.error('Error: apply expects the payload JSON on stdin');
    process.exit(1);
  }
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function runList(args: string[]): Promise<void> {
  const { getPlayedMatches } = await import('../lib/special-misses');
  const { getMatchSheet } = await import('../lib/match-money');

  const limitRaw = flagValue(args, '--limit');
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const unpaidOnly = args.includes('--unpaid-only');

  const played = await getPlayedMatches(unpaidOnly ? undefined : limit);

  if (!unpaidOnly) {
    console.log(JSON.stringify(played, null, 2));
    return;
  }

  const sheets = await Promise.all(played.map((match) => getMatchSheet(match.external_id)));
  const withOpenMoney = played
    .map((match, index) => ({ ...match, totals: sheets[index].totals }))
    .filter(({ totals }) => totals.fines_unpaid > 0
      || totals.bonuses_unpaid > 0
      || totals.trainer_unpaid > 0);

  console.log(JSON.stringify(limit ? withOpenMoney.slice(0, limit) : withOpenMoney, null, 2));
}

async function runSheet(args: string[]): Promise<void> {
  const { getMatchSheet } = await import('../lib/match-money');
  const sheet = await getMatchSheet(requireMatchId(args));
  console.log(JSON.stringify(sheet, null, 2));
}

async function runApply(args: string[]): Promise<void> {
  const { applyMatchMoneyUpdates, getMatchSheet } = await import('../lib/match-money');
  const matchId = requireMatchId(args);
  const raw = await readStdin();

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    console.error('Error: stdin is not valid JSON');
    process.exit(1);
  }

  if (args.includes('--dry-run')) {
    const sheet = await getMatchSheet(matchId);
    console.log(JSON.stringify({ dryRun: true, payload, currentSheet: sheet }, null, 2));
    return;
  }

  const result = await applyMatchMoneyUpdates(matchId, payload);
  console.log(JSON.stringify(result, null, 2));
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case 'list':
      await runList(args);
      break;
    case 'sheet':
      await runSheet(args);
      break;
    case 'apply':
      await runApply(args);
      break;
    default:
      console.log(USAGE);
  }

  process.exit(0);
}

main().catch(async (err) => {
  const { MatchMoneyError } = await import('../lib/match-money');
  console.error(err instanceof MatchMoneyError ? `Error: ${err.message}` : err);
  process.exit(1);
});
