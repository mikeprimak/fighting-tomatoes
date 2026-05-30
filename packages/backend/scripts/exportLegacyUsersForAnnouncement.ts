// One-off: export legacy users (password=null) for the announcement blast.
// Filters on `wantsEmails=true` and `isActive=true`. Writes CSV to project root.
// Capped at SENDGRID_FREE_CAP; keeps the most-active users (ratings+reviews,
// then lastLoginAt, then createdAt).
// Run: cd packages/backend && npx tsx scripts/exportLegacyUsersForAnnouncement.ts

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

const SENDGRID_FREE_CAP = 2000;

async function main() {
  console.log('Querying legacy users (password=null, wantsEmails=true, isActive=true)...\n');

  const users = await prisma.user.findMany({
    where: {
      password: null,
      wantsEmails: true,
      isActive: true,
    },
    select: {
      email: true,
      displayName: true,
      firstName: true,
      totalRatings: true,
      totalReviews: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  console.log(`Found ${users.length} legacy users.`);

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const valid = users.filter(u => isValidEmail(u.email));
  const invalidCount = users.length - valid.length;
  if (invalidCount > 0) {
    console.log(`Filtered out ${invalidCount} rows with invalid email format.`);
  }

  const scored = valid
    .map(u => ({
      ...u,
      activity: (u.totalRatings ?? 0) + (u.totalReviews ?? 0),
    }))
    .sort((a, b) => {
      if (b.activity !== a.activity) return b.activity - a.activity;
      const aLogin = a.lastLoginAt?.getTime() ?? 0;
      const bLogin = b.lastLoginAt?.getTime() ?? 0;
      if (bLogin !== aLogin) return bLogin - aLogin;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

  const kept = scored.slice(0, SENDGRID_FREE_CAP);
  const trimmed = scored.slice(SENDGRID_FREE_CAP);

  if (trimmed.length > 0) {
    console.log(`\nTrimmed ${trimmed.length} least-active users to fit cap of ${SENDGRID_FREE_CAP}.`);
    console.log('Trimmed users (email | activity | lastLoginAt | createdAt):');
    for (const u of trimmed) {
      console.log(`  ${u.email} | ${u.activity} | ${u.lastLoginAt?.toISOString() ?? 'never'} | ${u.createdAt.toISOString()}`);
    }
  }

  const escape = (v: string | null | undefined) => {
    const s = (v ?? '').trim();
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  kept.sort((a, b) => a.email.localeCompare(b.email));

  const header = 'email,first_name';
  const rows = kept.map(u => [
    escape(u.email),
    escape(u.displayName || u.firstName || 'fight fan'),
  ].join(','));

  const csv = [header, ...rows].join('\n') + '\n';

  const outPath = path.resolve(__dirname, '../../../legacy-users-for-announcement.csv');
  fs.writeFileSync(outPath, csv, 'utf8');

  console.log(`\nWrote CSV: ${outPath}`);
  console.log(`Total rows (excluding header): ${kept.length}`);
  console.log('\nUpload this CSV to Resend > Audiences.');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
