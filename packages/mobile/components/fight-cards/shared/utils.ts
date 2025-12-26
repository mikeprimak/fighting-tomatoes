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

// Format event name for display on fight cards
// - "UFC 322: Maddalena vs Makhachev" -> "UFC 322"
// - "UFC Fight Night: Tsarukyan vs Hooker" -> "UFC Tsarukyan vs Hooker"
export const formatEventName = (eventName: string) => {
  if (!eventName) return eventName;

  // Check if it's a numbered UFC event (e.g., "UFC 322: ...")
  const numberedMatch = eventName.match(/^(UFC\s+\d+)/i);
  if (numberedMatch) {
    return numberedMatch[1];
  }

  // Check if it's a Fight Night event (e.g., "UFC Fight Night: Tsarukyan vs Hooker")
  const fightNightMatch = eventName.match(/^UFC\s+Fight\s+Night[:\s]+(.+)$/i);
  if (fightNightMatch) {
    return `UFC ${fightNightMatch[1]}`;
  }

  // Return original name for other formats
  return eventName;
};
