// Shared utility functions for fight cards
import { Fighter } from './types';

// Get fighter image (either from profileImage or placeholder)
export const getFighterImage = (fighter: Fighter) => {
  // Check if profileImage exists and is a valid URL
  if (fighter.profileImage && fighter.profileImage.startsWith('http')) {
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

    return { uri: fighter.profileImage };
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

// Extract last name from full name
export const getLastName = (fullName: string) => {
  if (!fullName) return fullName;
  const parts = fullName.trim().split(' ');
  return parts[parts.length - 1];
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
