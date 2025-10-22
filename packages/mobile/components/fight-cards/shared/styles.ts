// Shared styles for fight cards
import { StyleSheet } from 'react-native';

export const sharedStyles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginHorizontal: 4,
    marginBottom: 8,
  },
  titleLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
    letterSpacing: 1,
  },
  eventText: {
    fontSize: 12,
    marginBottom: 4,
  },
  matchup: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  headshotsContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  fighterHeadshotWrapper: {
    position: 'relative',
    width: 75,
    height: 75,
    borderRadius: 37.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  horizontalInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 4,
    gap: 16,
  },
  ratingsWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    marginRight: 12,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  ratingIcon: {
    width: 36,
    textAlign: 'center',
    marginRight: 6,
  },
  aggregateLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  userRatingText: {
    fontSize: 16,
    fontWeight: '500',
  },
  unratedText: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 14,
  },
  sparkle: {
    position: 'absolute',
    zIndex: 10,
  },
  iconContainer: {
    width: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  outcomeContainer: {
    marginTop: 13,
    gap: 4,
  },
  outcomeLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  outcomeLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  outcomeLineText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
});
