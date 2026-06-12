/**
 * Reset an onboarding TEST account so the flow can be walked again from a
 * clean slate — part of the onboarding iteration harness (see
 * docs/playbooks/onboarding-iteration.md).
 *
 * Deletes the account's fight ratings and fighter follows THROUGH THE REAL
 * API ENDPOINTS (not raw prisma deletes) so fight rating aggregates
 * (averageRating/totalRatings/ratingsN) and notification rules are unwound by
 * the same tested code paths the app uses. Prisma is only used read-only to
 * list what to delete. The account itself, and its fighter_followed
 * analytics rows, are left alone.
 *
 * SAFETY: hard allowlist — refuses any email that isn't
 * testdev+<anything>@goodfights.app. Never run against a real account.
 *
 * Run (from packages/backend/, with the dev backend already running):
 *   npx tsx src/scripts/reset-onboarding-tester.ts --email testdev+onb0612@goodfights.app
 *   npx tsx src/scripts/reset-onboarding-tester.ts --email ... --api http://localhost:3008
 */
import { prisma } from '../lib/prisma';

const TESTER_PATTERN = /^testdev\+[^@]+@goodfights\.app$/;
const TESTER_PASSWORD = 'Testpass1!'; // shared dev test-account password

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg('email');
  const api = arg('api') ?? 'http://localhost:3008';

  if (!email) {
    console.error('Usage: npx tsx src/scripts/reset-onboarding-tester.ts --email testdev+NAME@goodfights.app [--api http://localhost:3008]');
    process.exit(1);
  }
  if (!TESTER_PATTERN.test(email)) {
    console.error(`REFUSED: "${email}" is not a testdev+*@goodfights.app account. This script never touches real accounts.`);
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
  if (!user) {
    console.error(`No user found for ${email}`);
    process.exit(1);
  }

  // Login through the API so deletes run as the user, through tested routes.
  const loginRes = await fetch(`${api}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: TESTER_PASSWORD }),
  });
  if (!loginRes.ok) {
    console.error(`Login failed (${loginRes.status}) — is the backend running at ${api}? Does the account use the shared dev password?`);
    process.exit(1);
  }
  const { accessToken } = (await loginRes.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };

  // Read-only inventory of what to unwind.
  const [ratings, follows] = await Promise.all([
    prisma.fightRating.findMany({
      where: { userId: user.id },
      select: { fightId: true },
    }),
    prisma.userFighterFollow.findMany({
      where: { userId: user.id },
      select: { fighterId: true },
    }),
  ]);
  console.log(`${email}: ${ratings.length} ratings, ${follows.length} follows to remove`);

  // Hype predictions count against the unverified soft cap, so clear them
  // too. Direct delete is safe here: Fight stores no hype aggregates
  // (averageHype is computed live per request), so there is nothing to unwind
  // — and there is no DELETE /prediction endpoint to reuse.
  const hype = await prisma.fightPrediction.deleteMany({
    where: { userId: user.id },
  });
  console.log(`  ${hype.count} hype predictions deleted`);

  let ok = 0;
  let failed = 0;
  for (const r of ratings) {
    const res = await fetch(`${api}/api/fights/${r.fightId}/rating`, {
      method: 'DELETE',
      headers: auth,
    });
    if (res.ok) ok++;
    else {
      failed++;
      console.error(`  rating delete failed (${res.status}) fight ${r.fightId}`);
    }
  }
  for (const f of follows) {
    const res = await fetch(`${api}/api/fighters/${f.fighterId}/unfollow`, {
      method: 'DELETE',
      headers: auth,
    });
    if (res.ok) ok++;
    else {
      failed++;
      console.error(`  unfollow failed (${res.status}) fighter ${f.fighterId}`);
    }
  }

  console.log(`Done: ${ok} removed, ${failed} failed. Account + analytics rows untouched.`);
  console.log('On the device: Profile -> "Replay Onboarding (dev)" to walk the flow again.');
  await prisma.$disconnect();
  process.exit(failed > 0 ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
