/**
 * Format-safety tests for imageStorage: sniffImageFormat + ensureDecodableRaster.
 *
 * Satori (behind next/og) decodes PNG/JPEG/GIF only. A WebP written into
 * Fighter.profileImage 500s the whole OG-image route (2026-07-27/28 incident:
 * RAF's Webflow-hosted headshots). These tests pin the two guarantees the
 * upload path now makes: formats are identified by bytes (never URL suffix or
 * Content-Type), and anything Satori can't decode comes back transcoded —
 * PNG when the source has alpha, JPEG when it doesn't.
 *
 * Pure functions + sharp — no network, no R2.
 *
 * Run from packages/backend:
 *   npx tsx src/services/imageStorage.formatSafety.test.ts
 *
 * Exit 0 = all asserts passed, 1 = any failure.
 */

import assert from 'assert';
import sharp from 'sharp';
import { sniffImageFormat, ensureDecodableRaster } from './imageStorage';

let passed = 0;
let failed = 0;
function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`  ok  ${label}`);
    })
    .catch((e: any) => {
      failed++;
      console.log(`FAIL  ${label}\n      ${e.message}`);
    });
}

async function main() {
  const base = { width: 8, height: 8, channels: 4 as const, background: { r: 200, g: 30, b: 30, alpha: 1 } };
  const alphaBase = { ...base, background: { r: 200, g: 30, b: 30, alpha: 0.5 } };

  const png = await sharp({ create: base }).png().toBuffer();
  const jpeg = await sharp({ create: base }).jpeg().toBuffer();
  const gif = await sharp({ create: base }).gif().toBuffer();
  const webpOpaque = await sharp({ create: base }).webp().toBuffer();
  const webpAlpha = await sharp({ create: alphaBase }).webp().toBuffer();
  const avif = await sharp({ create: base }).avif().toBuffer();

  // --- sniffing is byte-based ---
  await check('sniffs PNG', () => assert.strictEqual(sniffImageFormat(png), 'png'));
  await check('sniffs JPEG', () => assert.strictEqual(sniffImageFormat(jpeg), 'jpeg'));
  await check('sniffs GIF', () => assert.strictEqual(sniffImageFormat(gif), 'gif'));
  await check('sniffs WebP', () => assert.strictEqual(sniffImageFormat(webpOpaque), 'webp'));
  await check('sniffs AVIF', () => assert.strictEqual(sniffImageFormat(avif), 'avif'));
  await check('HTML error page is unknown, not an image', () =>
    assert.strictEqual(sniffImageFormat(Buffer.from('<!doctype html><html>')), 'unknown'));
  await check('empty buffer is unknown', () =>
    assert.strictEqual(sniffImageFormat(Buffer.alloc(0)), 'unknown'));

  // --- Satori-safe formats pass through untouched ---
  await check('PNG passes through byte-identical', async () => {
    const r = await ensureDecodableRaster(png);
    assert.strictEqual(r.transcoded, false);
    assert.strictEqual(r.extension, 'png');
    assert.ok(r.buffer.equals(png));
  });
  await check('JPEG passes through byte-identical', async () => {
    const r = await ensureDecodableRaster(jpeg);
    assert.strictEqual(r.transcoded, false);
    assert.strictEqual(r.extension, 'jpg');
    assert.ok(r.buffer.equals(jpeg));
  });
  await check('GIF passes through byte-identical', async () => {
    const r = await ensureDecodableRaster(gif);
    assert.strictEqual(r.transcoded, false);
    assert.strictEqual(r.extension, 'gif');
    assert.ok(r.buffer.equals(gif));
  });

  // --- unsafe formats come back decodable ---
  await check('opaque WebP transcodes to JPEG', async () => {
    const r = await ensureDecodableRaster(webpOpaque);
    assert.strictEqual(r.transcoded, true);
    assert.strictEqual(r.extension, 'jpg');
    assert.strictEqual(sniffImageFormat(r.buffer), 'jpeg');
  });
  await check('WebP with alpha transcodes to PNG (keeps transparency)', async () => {
    const r = await ensureDecodableRaster(webpAlpha);
    assert.strictEqual(r.transcoded, true);
    assert.strictEqual(r.extension, 'png');
    assert.strictEqual(sniffImageFormat(r.buffer), 'png');
    const meta = await sharp(r.buffer).metadata();
    assert.strictEqual(meta.hasAlpha, true);
  });
  await check('AVIF transcodes to a Satori-safe format', async () => {
    const r = await ensureDecodableRaster(avif);
    assert.strictEqual(r.transcoded, true);
    assert.ok(['png', 'jpg'].includes(r.extension));
    assert.ok(['png', 'jpeg'].includes(sniffImageFormat(r.buffer)));
  });
  await check('non-image bytes throw (treated as failed download)', async () => {
    await assert.rejects(() => ensureDecodableRaster(Buffer.from('<!doctype html><html>')));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
