// Shared utility functions for fight cards
import { Fighter } from './types';
import { API_BASE_URL } from '../../../services/api';

// Get the server base URL (without /api)
const getServerBaseUrl = () => API_BASE_URL.replace('/api', '');

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
export const getFighterName = (fighter: Fighter) => {
  const name = `${fighter.firstName} ${fighter.lastName}`;
  return fighter.nickname ? `${name} "${fighter.nickname}"` : name;
};

// Remove nicknames from fighter names
export const cleanFighterName = (displayName: string) => {
  const nicknameMatch = displayName.match(/^(.+)\s+"([^"]+)"$/);
  return nicknameMatch ? nicknameMatch[1].trim() : displayName;
};

// Extract last name from full name (everything except the first word)
export const getLastName = (fullName: string) => {
  if (!fullName) return fullName;
  const parts = fullName.trim().split(' ');
  if (parts.length === 1) return parts[0];
  return parts.slice(1).join(' ');
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
