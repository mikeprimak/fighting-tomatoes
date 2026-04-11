/**
 * Backfill broken ONE FC fighter names.
 *
 * Context (2026-04-10): the ONE FC scrapers used to derive fighter names
 * from their athlete URL slug (e.g. /athletes/rittidet/ → "Rittidet"), which
 * produced broken rows whenever ONE FC's URL slug was shorter than the
 * fighter's real display name. Examples: Nuapet Torfunfarm stored as
 * "Nuapet Tded99" (slug nuapet-tded99), Rittidet Lukjaoporongtom stored as
 * just "Rittidet", dozens of single-word rows like "Kompet", "Rodtang".
 *
 * The scrapers were fixed to prefer JSON-LD performer names. This script
 * cleans up the legacy broken rows by:
 *   1. Scraping each ONE FC event's page for its JSON-LD performer map
 *      paired with matchup face anchors, yielding slug → fullName.
 *   2. Finding DB fighter rows whose slug derivation matches any entry.
 *   3. For any whose stored name differs from the JSON-LD fullName:
 *      - If a correctly-named row already exists, merge (reassign FKs,
 *        delete the broken row).
 *      - Otherwise, rename in place.
 *
 * Usage:
 *   node scripts/fix-onefc-broken-names.js           # dry-run (default)
 *   node scripts/fix-onefc-broken-names.js --apply   # execute changes
 *   node scripts/fix-onefc-broken-names.js --limit=5 # only first 5 events
 */

const puppeteer = require('puppeteer');
const { PrismaClient } = require('@prisma/client');

const APPLY = process.argv.includes('--apply');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : null;

const prisma = new PrismaClient();

function stripDiacritics(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function extractNicknameAndClean(name) {
  const pairRe = /["'\u201c\u201d\u2018\u2019]([^"'\u201c\u201d\u2018\u2019]+)["'\u201c\u201d\u2018\u2019]/;
  const match = (name || '').match(pairRe);
  if (!match) return { cleanName: name || '', nickname: null };
  const nickname = match[1].trim();
  const cleanName = name.replace(pairRe, ' ').replace(/\s+/g, ' ').trim();
  return { cleanName, nickname: nickname || null };
}

/**
 * Convert a JSON-LD full name to {firstName, lastName, nickname},
 * matching the logic in oneFCDataParser.ts#parseOneFCFighterName.
 */
function fullNameToDbName(fullName) {
  const { cleanName, nickname } = extractNicknameAndClean(fullName);
  const parts = cleanName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return {
      firstName: stripDiacritics(parts[0]),
      lastName: stripDiacritics(parts.slice(1).join(' ')),
      nickname,
    };
  }
  if (parts.length === 1) {
    return { firstName: '', lastName: stripDiacritics(parts[0]), nickname };
  }
  return null;
}

/**
 * Derive the athlete-URL slug from a stored DB name, reversing the
 * legacy parseOneFCFighterName logic: kebab-case of firstName + lastName,
 * lowercased.
 */
function dbNameToSlug(firstName, lastName) {
  const join = [firstName, lastName].filter(Boolean).join(' ').trim().toLowerCase();
  return join.replace(/\s+/g, '-');
}

async function scrapeEventSlugMap(browser, eventUrl) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    await page.goto(eventUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  } catch (e) {
    await page.close();
    return { error: e.message, slugMap: {} };
  }

  const result = await page.evaluate(() => {
    const normalizeMatchupKey = (s) =>
      (s || '').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();

    // 1. Parse JSON-LD performer array into a matchup-name -> [A, B] map
    const versusToFullNames = {};
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      let data;
      try { data = JSON.parse(script.textContent); } catch { continue; }
      const candidates = [];
      if (Array.isArray(data)) candidates.push(...data);
      else candidates.push(data);
      if (data && data['@graph']) candidates.push(...data['@graph']);
      for (const entity of candidates) {
        if (!entity || entity['@type'] !== 'Event') continue;
        const performers = Array.isArray(entity.performer) ? entity.performer : [];
        for (let i = 0; i < performers.length; i++) {
          const p = performers[i];
          if (!p || p['@type'] !== 'PerformingGroup' || !p.name) continue;
          const a = performers[i + 1];
          const b = performers[i + 2];
          if (a && a['@type'] === 'Person' && a.name && b && b['@type'] === 'Person' && b.name) {
            versusToFullNames[normalizeMatchupKey(p.name)] = {
              fighterAFullName: String(a.name).trim(),
              fighterBFullName: String(b.name).trim(),
            };
          }
        }
      }
    }

    // 2. Walk real matchup elements, pair each with JSON-LD names by versus key
    const allMatchups = document.querySelectorAll('.event-matchup');
    const realMatchups = Array.from(allMatchups).filter((m) => {
      if (m.closest('.box-post-event')) return false;
      if (m.closest('.event-live-status')) return false;
      if (m.closest('.status-matchup')) return false;
      const hasStats = !!m.querySelector('.stats table tr.vs');
      const f1 = m.querySelector('a.face.face1');
      const f2 = m.querySelector('a.face.face2');
      return hasStats && f1?.href?.includes('/athletes/') && f2?.href?.includes('/athletes/');
    });

    // Build slug → fullName
    const slugMap = {};
    const extractSlug = (href) => {
      const m = href.match(/\/athletes\/([^/?#]+)/);
      return m ? m[1].toLowerCase() : null;
    };

    for (const matchup of realMatchups) {
      const versusEl = matchup.querySelector('.versus');
      const versusText = versusEl?.textContent?.trim() || '';
      const key = normalizeMatchupKey(versusText);
      const hit = versusToFullNames[key];
      if (!hit) continue;

      const face1 = matchup.querySelector('a.face.face1');
      const face2 = matchup.querySelector('a.face.face2');
      const slugA = extractSlug(face1?.href || '');
      const slugB = extractSlug(face2?.href || '');

      if (slugA && hit.fighterAFullName) slugMap[slugA] = hit.fighterAFullName;
      if (slugB && hit.fighterBFullName) slugMap[slugB] = hit.fighterBFullName;
    }

    return { slugMap };
  });

  await page.close();
  return result;
}

async function mergeFighters(brokenId, targetId, targetName) {
  // Reassign all FK references from broken -> target, then delete broken.
  // Prisma doesn't expose an atomic "merge" so we do it per FK column.
  return await prisma.$transaction(async (tx) => {
    await tx.fight.updateMany({ where: { fighter1Id: brokenId }, data: { fighter1Id: targetId } });
    await tx.fight.updateMany({ where: { fighter2Id: brokenId }, data: { fighter2Id: targetId } });
    await tx.fight.updateMany({ where: { winner: brokenId }, data: { winner: targetId } });

    // Follower rows — ignore duplicates quietly via deleteMany+skip not being
    // available, so move what we can and let unique-key violations surface.
    const follows = await tx.userFighterFollow.findMany({ where: { fighterId: brokenId } });
    for (const f of follows) {
      const existing = await tx.userFighterFollow.findFirst({
        where: { userId: f.userId, fighterId: targetId },
      });
      if (existing) {
        await tx.userFighterFollow.delete({ where: { id: f.id } });
      } else {
        await tx.userFighterFollow.update({ where: { id: f.id }, data: { fighterId: targetId } });
      }
    }

    await tx.fighter.delete({ where: { id: brokenId } });
    return { merged: true, into: targetName };
  });
}

async function main() {
  console.log(`\n🔧 ONE FC name backfill — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}${LIMIT ? ` (limit ${LIMIT} events)` : ''}\n`);

  // 1. Fetch all ONE FC events with a URL
  const events = await prisma.event.findMany({
    where: { promotion: 'ONE', ufcUrl: { not: null } },
    select: { id: true, name: true, ufcUrl: true, date: true },
    orderBy: { date: 'desc' },
    ...(LIMIT ? { take: LIMIT } : {}),
  });
  console.log(`Events to scan: ${events.length}`);

  // 2. Fetch all ONE FC fighters once (any row that appears in a ONE FC fight)
  //
  // Scope guard: reject any fighter row that also has fights outside ONE FC.
  // Without this, a rename or merge would silently change how the fighter
  // appears in every other promotion's events too, and merges would pull
  // non-ONE-FC fights over to the target row. MVP policy: only touch rows
  // whose entire fight history is ONE FC.
  const dbFightersRaw = await prisma.fighter.findMany({
    where: {
      OR: [
        { fightsAsFighter1: { some: { event: { promotion: 'ONE' } } } },
        { fightsAsFighter2: { some: { event: { promotion: 'ONE' } } } },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      nickname: true,
      fightsAsFighter1: { select: { event: { select: { promotion: true } } } },
      fightsAsFighter2: { select: { event: { select: { promotion: true } } } },
    },
  });

  const dbFighters = [];
  let excludedCrossPromotion = 0;
  for (const f of dbFightersRaw) {
    const allPromos = new Set([
      ...f.fightsAsFighter1.map(x => x.event.promotion),
      ...f.fightsAsFighter2.map(x => x.event.promotion),
    ]);
    if (allPromos.size === 1 && allPromos.has('ONE')) {
      dbFighters.push({
        id: f.id,
        firstName: f.firstName,
        lastName: f.lastName,
        nickname: f.nickname,
      });
    } else {
      excludedCrossPromotion++;
    }
  }

  console.log(`ONE FC fighters in DB: ${dbFightersRaw.length} (${excludedCrossPromotion} excluded: have fights in other promotions)`);

  // Build slug → fighter-row map (legacy slug reversal)
  const slugToFighter = new Map();
  for (const f of dbFighters) {
    const slug = dbNameToSlug(f.firstName, f.lastName);
    if (slug && !slugToFighter.has(slug)) slugToFighter.set(slug, f);
  }

  // 3. Scrape events, build global slug → fullName map
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const globalSlugToFull = {};
  let eventsOk = 0;
  let eventsErr = 0;

  try {
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      process.stdout.write(`  [${i + 1}/${events.length}] ${ev.name.slice(0, 60)} ... `);
      const res = await scrapeEventSlugMap(browser, ev.ufcUrl);
      if (res.error) {
        console.log(`ERR: ${res.error}`);
        eventsErr++;
        continue;
      }
      const entries = Object.entries(res.slugMap || {});
      for (const [slug, fullName] of entries) {
        if (!globalSlugToFull[slug]) globalSlugToFull[slug] = fullName;
      }
      console.log(`${entries.length} slugs`);
      eventsOk++;
    }
  } finally {
    await browser.close();
  }

  console.log(`\nScraped: ${eventsOk} ok, ${eventsErr} errors. Unique slugs: ${Object.keys(globalSlugToFull).length}\n`);

  // 4. Compare DB rows to JSON-LD names, propose actions
  //
  // Safety rule: only propose a rename/merge if the new name and old name
  // share their first token AND the new name has >= as many words as the
  // old name. This prevents two classes of false positives:
  //   - JSON-LD for a recent event may carry a fighter's short-form name
  //     (e.g. "Vero" with nickname "The Kayan Leopard") while the DB has
  //     the fuller historical name ("Vero Nika"). We would otherwise
  //     *shorten* real data.
  //   - Slug derivation from the DB name can collide with an unrelated
  //     fighter whose athlete URL is similar (e.g. "Banluerit Or Atchariya"
  //     reverses to a slug that matches a completely different fighter's
  //     JSON-LD entry). Requiring the first token to match catches these.
  //
  // Accepted losses: some legitimate merges where the DB first token
  // differs from the JSON-LD form (e.g. "Sam A" → "Sam-A Gaiyanghadao",
  // "Yod Iq" → "Yod-IQ Or Pimolsri"). These are edge cases worth doing
  // manually.
  const skipped = [];
  const actions = [];
  for (const f of dbFighters) {
    const slug = dbNameToSlug(f.firstName, f.lastName);
    const fullName = globalSlugToFull[slug];
    if (!fullName) continue;

    const correct = fullNameToDbName(fullName);
    if (!correct) continue;

    const sameFirst = (f.firstName || '').toLowerCase() === (correct.firstName || '').toLowerCase();
    const sameLast = (f.lastName || '').toLowerCase() === (correct.lastName || '').toLowerCase();
    if (sameFirst && sameLast) continue; // already correct

    const oldWords = `${f.firstName} ${f.lastName}`.trim().split(/\s+/).filter(Boolean);
    const newWords = `${correct.firstName} ${correct.lastName}`.trim().split(/\s+/).filter(Boolean);
    const oldFirst = (oldWords[0] || '').toLowerCase();
    const newFirst = (newWords[0] || '').toLowerCase();

    const firstWordMatches = oldFirst === newFirst;
    const newIsAtLeastAsLong = newWords.length >= oldWords.length;

    if (!firstWordMatches || !newIsAtLeastAsLong) {
      skipped.push({
        brokenName: `${f.firstName} ${f.lastName}`.trim() || '(empty)',
        proposedName: `${correct.firstName} ${correct.lastName}`.trim(),
        reason: !firstWordMatches ? 'first-word mismatch' : 'would shorten',
      });
      continue;
    }

    actions.push({
      brokenId: f.id,
      brokenName: `${f.firstName} ${f.lastName}`.trim() || '(empty)',
      slug,
      fullName,
      correct,
    });
  }

  if (skipped.length > 0) {
    console.log(`Skipped (unsafe): ${skipped.length}`);
    for (const s of skipped) {
      console.log(`  SKIP   "${s.brokenName}" → "${s.proposedName}" (${s.reason})`);
    }
    console.log('');
  }

  console.log(`Actions needed: ${actions.length}\n`);
  if (actions.length === 0) {
    console.log('✅ All ONE FC fighter rows match JSON-LD names.');
    await prisma.$disconnect();
    return;
  }

  // 5. Execute (or log for dry-run)
  let renamed = 0;
  let merged = 0;
  let failed = 0;

  for (const a of actions) {
    const targetName = `${a.correct.firstName} ${a.correct.lastName}`.trim();
    const existing = await prisma.fighter.findUnique({
      where: {
        firstName_lastName: {
          firstName: a.correct.firstName,
          lastName: a.correct.lastName,
        },
      },
      select: { id: true },
    });

    if (existing && existing.id !== a.brokenId) {
      console.log(`  MERGE  "${a.brokenName}" → "${targetName}" (existing row ${existing.id.slice(0, 8)})`);
      merged++;
      if (APPLY) {
        try {
          await mergeFighters(a.brokenId, existing.id, targetName);
        } catch (e) {
          console.log(`         ❌ merge failed: ${e.message}`);
          failed++;
          merged--;
        }
      }
    } else {
      console.log(`  RENAME "${a.brokenName}" → "${targetName}"${a.correct.nickname ? ` (nickname: "${a.correct.nickname}")` : ''}`);
      renamed++;
      if (APPLY) {
        try {
          await prisma.fighter.update({
            where: { id: a.brokenId },
            data: {
              firstName: a.correct.firstName,
              lastName: a.correct.lastName,
              ...(a.correct.nickname ? { nickname: a.correct.nickname } : {}),
            },
          });
        } catch (e) {
          console.log(`         ❌ rename failed: ${e.message}`);
          failed++;
          renamed--;
        }
      }
    }
  }

  if (APPLY) {
    console.log(`\nApplied: ${renamed} rename${renamed === 1 ? '' : 's'}, ${merged} merge${merged === 1 ? '' : 's'}${failed ? `, ${failed} failed` : ''}`);
  } else {
    console.log(`\nWould apply: ${renamed} rename${renamed === 1 ? '' : 's'}, ${merged} merge${merged === 1 ? '' : 's'}`);
    console.log(`Re-run with --apply to execute.`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('\n❌ Fatal:', e);
  await prisma.$disconnect();
  process.exit(1);
});
