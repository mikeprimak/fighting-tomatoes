import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 2026 broadcaster matrix — see docs/plans/how-to-watch-broadcaster-research-2026-05-03.md
const channels = [
  // Major streamers
  { slug: 'paramount-plus',     name: 'Paramount+',            homepageUrl: 'https://www.paramountplus.com/' },
  { slug: 'cbs',                name: 'CBS',                   homepageUrl: 'https://www.cbs.com/' },
  { slug: 'dazn',               name: 'DAZN',                  homepageUrl: 'https://www.dazn.com/' },
  { slug: 'dazn-dach',          name: 'DAZN DACH',             homepageUrl: 'https://www.dazn.com/de-DE/' },
  { slug: 'espn-plus',          name: 'ESPN+',                 homepageUrl: 'https://plus.espn.com/' },
  { slug: 'prime-video',        name: 'Prime Video',           homepageUrl: 'https://www.primevideo.com/' },
  { slug: 'netflix',            name: 'Netflix',               homepageUrl: 'https://www.netflix.com/' },
  { slug: 'youtube',            name: 'YouTube',               homepageUrl: 'https://www.youtube.com/' },
  { slug: 'fox-nation',         name: 'Fox Nation',            homepageUrl: 'https://nation.foxnews.com/' },

  // UFC legacy / archive
  { slug: 'ufc-fight-pass',     name: 'UFC Fight Pass',        homepageUrl: 'https://ufcfightpass.com/' },

  // UK
  { slug: 'tnt-sports',         name: 'TNT Sports',            homepageUrl: 'https://www.tntsports.co.uk/' },
  { slug: 'sky-sports',         name: 'Sky Sports',            homepageUrl: 'https://www.skysports.com/' },

  // Canada
  { slug: 'sportsnet',          name: 'Sportsnet',             homepageUrl: 'https://www.sportsnet.ca/' },
  { slug: 'tva-sports',         name: 'TVA Sports',            homepageUrl: 'https://www.tvasports.ca/' },
  { slug: 'tsn-plus',           name: 'TSN+',                  homepageUrl: 'https://www.tsn.ca/plus' },

  // Australia / NZ
  { slug: 'kayo',               name: 'Kayo Sports',           homepageUrl: 'https://kayosports.com.au/' },
  { slug: 'foxtel',             name: 'Foxtel',                homepageUrl: 'https://www.foxtel.com.au/' },
  { slug: 'main-event',         name: 'Main Event',            homepageUrl: 'https://mainevent.kayosports.com.au/' },
  { slug: 'sky-sport-nz',       name: 'Sky Sport (NZ)',        homepageUrl: 'https://www.skysport.co.nz/' },

  // Streamers (additional)
  { slug: 'disney-plus',        name: 'Disney+',               homepageUrl: 'https://www.disneyplus.com/' },
  { slug: 'stan-sport',         name: 'Stan Sport',            homepageUrl: 'https://www.stan.com.au/sport' },

  // Per-promotion / niche
  { slug: 'fite-triller',       name: 'FITE by Triller',       homepageUrl: 'https://www.trillertv.com/' },
  { slug: 'rizin-tv',           name: 'RIZIN.TV',              homepageUrl: 'https://www.rizin.tv/' },
  { slug: 'rizin-confession',   name: 'RIZIN Confession',      homepageUrl: 'https://confession.rizinff.com/' },
  { slug: 'wowow',              name: 'WOWOW',                 homepageUrl: 'https://www.wowow.co.jp/' },
  { slug: 'oktagon-tv',         name: 'Oktagon.TV',            homepageUrl: 'https://www.oktagon.tv/' },
  { slug: 'karate-combat-app',  name: 'Karate Combat',         homepageUrl: 'https://www.karate.com/' },
  { slug: 'sherdog-fight-pass', name: 'Sherdog Fight Pass',    homepageUrl: 'https://www.sherdog.com/fightpass' },
];

async function main() {
  console.log(`Seeding ${channels.length} broadcast channels...`);
  for (const c of channels) {
    const existing = await prisma.broadcastChannel.findUnique({ where: { slug: c.slug } });
    if (existing) {
      await prisma.broadcastChannel.update({
        where: { slug: c.slug },
        data: { name: c.name, homepageUrl: c.homepageUrl },
      });
      console.log(`  updated  ${c.slug}`);
    } else {
      await prisma.broadcastChannel.create({ data: c });
      console.log(`  created  ${c.slug}`);
    }
  }
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
