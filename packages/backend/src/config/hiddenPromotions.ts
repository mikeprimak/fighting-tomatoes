// Promotions hidden from all API responses (events, search, community).
// Events/fights from these promotions exist in the DB but are never returned to clients.
//
// Runtime-adjustable: derives from the registry's shelved cache, which the admin
// panel controls via SystemConfig ('shelved_promotions'). Call getHiddenPromotions()
// at request time (it reads the in-memory cache — cheap). Don't hand-maintain a list.
import { getShelvedPromotionStrings } from './promotionRegistry';

/** Canonical + alias strings of every currently-shelved promotion. */
export function getHiddenPromotions(): string[] {
  return getShelvedPromotionStrings();
}
