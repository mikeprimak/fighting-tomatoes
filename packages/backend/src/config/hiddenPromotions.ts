// Promotions to permanently hide from all API responses.
// Events/fights from these promotions exist in the DB but are never returned to clients.
//
// Derived from the org registry — orgs with `hiddenFromApi: true` contribute their
// uppercased dbPromotion value here. To hide/unhide an org, edit ./orgs.ts.
import { DERIVED_HIDDEN_PROMOTIONS } from './orgs';

export const HIDDEN_PROMOTIONS: string[] = DERIVED_HIDDEN_PROMOTIONS;
