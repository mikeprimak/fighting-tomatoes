/**
 * Fan DNA trait registry. Auto-discovers everything under `traits/{id}/trait.ts`
 * at boot — no central registration list to keep in sync. Adding a new trait =
 * adding one directory.
 *
 * Each trait file must default-export an object satisfying `Trait` (see
 * `types.ts`). The `id` MUST match the directory name; the loader enforces.
 */
import * as fs from 'fs';
import * as path from 'path';

import type { FanDNAAction, Trait } from './types';

let cached: Map<string, Trait> | null = null;

/**
 * Load every trait under `traits/`. Synchronous + memoized: first call walks
 * the filesystem, subsequent calls return the cached map.
 */
export function getAllTraits(): readonly Trait[] {
  return Array.from(getRegistry().values());
}

export function getTrait(id: string): Trait | undefined {
  return getRegistry().get(id);
}

export function getTraitsRespondingTo(action: FanDNAAction): readonly Trait[] {
  return getAllTraits().filter(
    (t) => !t.deprecated && t.respondsTo.includes(action),
  );
}

/** Force-rebuild the registry. Test-only — production never calls this. */
export function resetRegistryForTests(): void {
  cached = null;
}

function getRegistry(): Map<string, Trait> {
  if (cached) return cached;
  cached = loadRegistry();
  return cached;
}

function loadRegistry(): Map<string, Trait> {
  const map = new Map<string, Trait>();
  const traitsDir = path.join(__dirname, 'traits');
  if (!fs.existsSync(traitsDir)) return map;

  const entries = fs.readdirSync(traitsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const traitDir = path.join(traitsDir, entry.name);
    const candidates = ['trait.ts', 'trait.js'];
    const traitFile = candidates
      .map((n) => path.join(traitDir, n))
      .find((p) => fs.existsSync(p));
    if (!traitFile) {
      // Directory without a trait.ts — skip silently. Lets us put fixtures or
      // copy.json next to traits without registering them.
      continue;
    }
    let mod: { default?: Trait };
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      mod = require(traitFile);
    } catch (err) {
      console.error(`[fanDNA] Failed to load trait at ${traitFile}:`, err);
      continue;
    }
    const trait = mod.default;
    if (!trait || typeof trait !== 'object') {
      console.error(`[fanDNA] ${traitFile}: no default export`);
      continue;
    }
    if (trait.id !== entry.name) {
      console.error(
        `[fanDNA] ${traitFile}: trait.id="${trait.id}" must match directory name "${entry.name}"`,
      );
      continue;
    }
    if (map.has(trait.id)) {
      console.error(`[fanDNA] Duplicate trait id: ${trait.id}`);
      continue;
    }
    map.set(trait.id, trait);
  }

  console.log(
    `[fanDNA] Registered ${map.size} trait(s): ${Array.from(map.keys()).join(', ') || '(none)'}`,
  );
  return map;
}
