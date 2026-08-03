/* eslint-disable no-console */
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
  const {
    getMatchTrainerPayments,
    updateTrainerPaymentStatus,
  } = await import('../lib/trainer-payments');
  const { getPlayedMatches } = await import('../lib/special-misses');

  const args = process.argv.slice(2);

  if (args.includes('--list-matches')) {
    const matches = await getPlayedMatches();
    console.log(JSON.stringify(matches, null, 2));
    process.exit(0);
  }

  if (args.includes('--get-payments')) {
    const matchIdIndex = args.indexOf('--match-id');
    if (matchIdIndex === -1 || !args[matchIdIndex + 1]) {
      console.error('Error: --match-id required');
      process.exit(1);
    }
    const matchId = Number(args[matchIdIndex + 1]);
    const payments = await getMatchTrainerPayments(matchId);
    console.log(JSON.stringify(payments, null, 2));
    process.exit(0);
  }

  if (args.includes('--update-payment')) {
    const paymentIdIdx = args.indexOf('--payment-id');
    const isPaidIdx = args.indexOf('--is-paid');

    if (paymentIdIdx === -1 || isPaidIdx === -1) {
      console.error('Error: --payment-id and --is-paid are required');
      process.exit(1);
    }

    const paymentId = Number(args[paymentIdIdx + 1]);
    const isPaid = args[isPaidIdx + 1] === 'true';

    await updateTrainerPaymentStatus(paymentId, isPaid);
    console.log(`Successfully updated trainer payment status for ID ${paymentId}.`);
    process.exit(0);
  }

  console.log('Usage:');
  console.log('  npx tsx scripts/update-trainer-payments.ts --list-matches');
  console.log('  npx tsx scripts/update-trainer-payments.ts --get-payments --match-id <matchId>');
  console.log(
    '  npx tsx scripts/update-trainer-payments.ts --update-payment --payment-id <paymentId> --is-paid <true|false>',
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
