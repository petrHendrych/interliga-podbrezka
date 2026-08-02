/* eslint-disable no-console */
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
  const {
    getPlayedMatches,
    getMatchPlayers,
    updatePlayerSpecialMisses,
    updatePlayerPaymentStatus,
  } = await import('../lib/special-misses');

  const args = process.argv.slice(2);

  if (args.includes('--list-matches')) {
    const matches = await getPlayedMatches();
    console.log(JSON.stringify(matches, null, 2));
    process.exit(0);
  }

  if (args.includes('--get-players')) {
    const matchIdIndex = args.indexOf('--match-id');
    if (matchIdIndex === -1 || !args[matchIdIndex + 1]) {
      console.error('Error: --match-id required');
      process.exit(1);
    }
    const matchId = Number(args[matchIdIndex + 1]);
    const players = await getMatchPlayers(matchId);
    console.log(JSON.stringify(players, null, 2));
    process.exit(0);
  }

  if (args.includes('--update-misses')) {
    const matchIdIdx = args.indexOf('--match-id');
    const userIdIdx = args.indexOf('--user-id');
    const fullFaultsIdx = args.indexOf('--full-faults');
    const secondToLastFaultsIdx = args.indexOf('--second-to-last-faults');

    const isMissingArg = matchIdIdx === -1
      || userIdIdx === -1
      || fullFaultsIdx === -1
      || secondToLastFaultsIdx === -1;

    if (isMissingArg) {
      console.error(
        'Error: --match-id, --user-id, --full-faults, and --second-to-last-faults are required',
      );
      process.exit(1);
    }

    const matchId = Number(args[matchIdIdx + 1]);
    const userId = args[userIdIdx + 1];
    const fullFaults = Number(args[fullFaultsIdx + 1]);
    const secondToLastFaults = Number(args[secondToLastFaultsIdx + 1]);

    await updatePlayerSpecialMisses(matchId, userId, fullFaults, secondToLastFaults);
    console.log(`Successfully updated special misses for player ${userId} in match ${matchId}.`);
    process.exit(0);
  }

  if (args.includes('--update-payment')) {
    const matchIdIdx = args.indexOf('--match-id');
    const userIdIdx = args.indexOf('--user-id');
    const isPaidIdx = args.indexOf('--is-paid');
    const isBonusPaidIdx = args.indexOf('--is-bonus-paid');

    if (matchIdIdx === -1 || userIdIdx === -1 || isPaidIdx === -1 || isBonusPaidIdx === -1) {
      console.error(
        'Error: --match-id, --user-id, --is-paid, and --is-bonus-paid are required',
      );
      process.exit(1);
    }

    const matchId = Number(args[matchIdIdx + 1]);
    const userId = args[userIdIdx + 1];
    const isPaid = args[isPaidIdx + 1] === 'true';
    const isBonusPaid = args[isBonusPaidIdx + 1] === 'true';

    await updatePlayerPaymentStatus(matchId, userId, isPaid, isBonusPaid);
    console.log(`Successfully updated payment status for player ${userId} in match ${matchId}.`);
    process.exit(0);
  }

  console.log('Usage:');
  console.log('  npx tsx scripts/update-special-misses.ts --list-matches');
  console.log('  npx tsx scripts/update-special-misses.ts --get-players --match-id <matchId>');
  console.log(
    '  npx tsx scripts/update-special-misses.ts --update-misses '
      + '--match-id <matchId> --user-id <userId> --full-faults <N> --second-to-last-faults <M>',
  );
  console.log(
    '  npx tsx scripts/update-special-misses.ts --update-payment '
      + '--match-id <matchId> --user-id <userId> --is-paid <true|false> --is-bonus-paid <true|false>',
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
