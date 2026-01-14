// Shared utility functions for fight cards
import { Fighter } from './types';
import { API_BASE_URL } from '../../../services/api';

// Get the server base URL (without /api)
const getServerBaseUrl = () => API_BASE_URL.replace('/api', '');

// Process fighter image URL (handles relative paths for non-UFC promotions)
// Returns a full URL string or null
export const getFighterImageUrl = (imageUrl: string | null | undefined): string | null => {
  if (!imageUrl) return null;

  // Check if the URL points to a known default/placeholder image
  const isDefaultImage =
    imageUrl.includes('silhouette') ||
    imageUrl.includes('default-fighter') ||
    imageUrl.includes('placeholder') ||
    imageUrl.includes('avatar-default') ||
    imageUrl.includes('no-image') ||
    imageUrl.includes('_headshot_default') ||
    imageUrl.includes('default_headshot');

  if (isDefaultImage) return null;

  // Handle full URLs (http/https)
  if (imageUrl.startsWith('http')) {
    return imageUrl;
  }

  // Handle relative paths (e.g., /images/athletes/oktagon/...)
  if (imageUrl.startsWith('/')) {
    return `${getServerBaseUrl()}${imageUrl}`;
  }

  return null;
};

// Get fighter image (either from profileImage or placeholder)
export const getFighterImage = (fighter: Fighter) => {
  if (!fighter.profileImage) {
    return require('../../../assets/fighters/fighter-default-alpha.png');
  }

  // Check if the URL points to a known default/placeholder image
  const isDefaultImage =
    fighter.profileImage.includes('silhouette') ||
    fighter.profileImage.includes('default-fighter') ||
    fighter.profileImage.includes('placeholder') ||
    fighter.profileImage.includes('avatar-default') ||
    fighter.profileImage.includes('no-image') ||
    // UFC's default fighter image URL pattern
    fighter.profileImage.includes('_headshot_default') ||
    fighter.profileImage.includes('default_headshot');

  // If it's a default image from the source, use our transparent placeholder
  if (isDefaultImage) {
    return require('../../../assets/fighters/fighter-default-alpha.png');
  }

  // Handle full URLs (http/https)
  if (fighter.profileImage.startsWith('http')) {
    return { uri: fighter.profileImage };
  }

  // Handle relative paths (e.g., /images/athletes/oktagon/...)
  if (fighter.profileImage.startsWith('/')) {
    return { uri: `${getServerBaseUrl()}${fighter.profileImage}` };
  }

  return require('../../../assets/fighters/fighter-default-alpha.png');
};

// Get full fighter name with nickname
// Handles single-name fighters stored in lastName with empty firstName
export const getFighterName = (fighter: Fighter) => {
  const first = fighter.firstName?.trim() || '';
  const last = fighter.lastName?.trim() || '';

  // Single-name fighter (stored in lastName)
  if (!first && last) {
    return fighter.nickname ? `${last} "${fighter.nickname}"` : last;
  }

  // Single-name fighter stored in firstName (legacy data)
  if (first && !last) {
    return fighter.nickname ? `${first} "${fighter.nickname}"` : first;
  }

  // Normal two-part name
  const fullName = `${first} ${last}`.trim();
  return fighter.nickname ? `${fullName} "${fighter.nickname}"` : fullName;
};

// Get display name without nickname
// Handles single-name fighters stored in lastName with empty firstName
export const getFighterDisplayName = (fighter: Fighter) => {
  const first = fighter.firstName?.trim() || '';
  const last = fighter.lastName?.trim() || '';

  if (!first && last) return last;
  if (first && !last) return first;
  return `${first} ${last}`.trim();
};

// Remove nicknames from fighter names
export const cleanFighterName = (displayName: string) => {
  const nicknameMatch = displayName.match(/^(.+)\s+"([^"]+)"$/);
  return nicknameMatch ? nicknameMatch[1].trim() : displayName;
};

// Extract last name from full name (everything except the first word)
// For single-name fighters, returns the single name
export const getLastName = (fullName: string) => {
  if (!fullName) return fullName;
  const parts = fullName.trim().split(' ');
  if (parts.length === 1) return parts[0];
  return parts.slice(1).join(' ');
};

// Get the primary name for display (lastName, or firstName if lastName empty)
// Useful for compact displays like "Jones vs Miocic"
export const getFighterPrimaryName = (fighter: Fighter) => {
  const last = fighter.lastName?.trim() || '';
  const first = fighter.firstName?.trim() || '';
  return last || first;
};

// Format date string
export const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// Format fight method
export const formatMethod = (method: string | null | undefined) => {
  if (!method) return '';
  if (method === 'KO_TKO') return 'KO/TKO';
  if (method === 'DECISION') return 'Decision';
  if (method === 'SUBMISSION') return 'Submission';
  return method;
};

// Format promotion name for display
// e.g., "TOP_RANK" -> "Top Rank", "GOLDEN_BOY" -> "Golden Boy"
// Preserves known acronyms like UFC, PFL, ONE, BKFC, etc.
export const formatPromotionName = (promotion: string): string => {
  // Known acronyms that should stay uppercase
  const acronyms = ['UFC', 'PFL', 'ONE', 'BKFC', 'RIZIN', 'OKTAGON', 'MVP', 'PBC', 'DAZN', 'ESPN'];

  // Replace underscores with spaces
  const withSpaces = promotion.replace(/_/g, ' ');

  // Title case each word, but preserve acronyms
  return withSpaces
    .split(' ')
    .map(word => {
      const upper = word.toUpperCase();
      if (acronyms.includes(upper)) return upper;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
};

// Normalize event name to always include promotion prefix
// Legacy events may have names like "321" or "Friday Fights 137" without the promotion
// This function ensures names display as "UFC 321" or "ONE Friday Fights 137"
export const normalizeEventName = (eventName: string, promotion?: string | null): string => {
  if (!eventName || !promotion) return eventName;

  const nameLower = eventName.toLowerCase();
  const promoLower = promotion.toLowerCase();

  // Check if the event name already contains the promotion
  if (nameLower.includes(promoLower)) {
    return eventName;
  }

  // Handle multi-word promotions like "Matchroom Boxing" - check first word too
  const promoFirstWord = promoLower.split(' ')[0];
  if (promoFirstWord.length > 2 && nameLower.startsWith(promoFirstWord)) {
    return eventName;
  }

  // Format the promotion name for display
  const formattedPromo = formatPromotionName(promotion);

  // Special case: Don't double-prefix if name starts with a number and promotion is UFC
  // e.g., "321" should become "UFC 321", not "UFC UFC 321"
  const startsWithNumber = /^\d+$/.test(eventName.trim());
  if (startsWithNumber) {
    return `${formattedPromo} ${eventName}`;
  }

  // Prepend the promotion
  return `${formattedPromo} ${eventName}`;
};

// Format event name for display on fight cards
// - "UFC 322: Maddalena vs Makhachev" -> "UFC 322"
// - "UFC Fight Night: Tsarukyan vs Hooker" -> "UFC Tsarukyan vs Hooker"
// - "321" with promotion="UFC" -> "UFC 321"
export const formatEventName = (eventName: string, promotion?: string | null) => {
  if (!eventName) return eventName;

  // First normalize the event name to include promotion if missing
  const normalizedName = normalizeEventName(eventName, promotion);

  // Check if it's a numbered UFC event (e.g., "UFC 322: ...")
  const numberedMatch = normalizedName.match(/^(UFC\s+\d+)/i);
  if (numberedMatch) {
    return numberedMatch[1];
  }

  // Check if it's a Fight Night event (e.g., "UFC Fight Night: Tsarukyan vs Hooker")
  const fightNightMatch = normalizedName.match(/^UFC\s+Fight\s+Night[:\s]+(.+)$/i);
  if (fightNightMatch) {
    return `UFC ${fightNightMatch[1]}`;
  }

  // Return normalized name for other formats
  return normalizedName;
};
