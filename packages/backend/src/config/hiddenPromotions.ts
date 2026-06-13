// Promotions hidden from all API responses (events, search, community).
// Events/fights from these promotions exist in the DB but are never returned to clients.
//
// DERIVED from the promotion registry's master switch — any org with
// `status: 'shelved'` is hidden here automatically. Don't hand-edit this list;
// flip the org's `status` in promotionRegistry.ts instead (single source of truth).
import { SHELVED_PROMOTION_STRINGS } from './promotionRegistry';

export const HIDDEN_PROMOTIONS: string[] = [...SHELVED_PROMOTION_STRINGS];
