import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Image,
  useColorScheme,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Colors } from '../../constants/Colors';
import { hasRecord } from '../../utils/formatRecord';
import { apiService, Fight } from '../../services/api';
import { DetailScreenHeader, FightDisplayCard } from '../../components';
import UpcomingFightModal from '../../components/UpcomingFightModal';
import FollowFighterButton from '../../components/FollowFighterButton';
import { useAuth } from '../../store/AuthContext';
import { FontAwesome } from '@expo/vector-icons';
import { getFighterImage } from '../../components/fight-cards/shared/utils';

type SortOption = 'newest' | 'oldest' | 'highest-rating' | 'most-rated';

const SORT_OPTIONS = [
  { value: 'highest-rating' as SortOption, label: 'Highest Rated' },
  { value: 'newest' as SortOption, label: 'Date' },
  { value: 'most-rated' as SortOption, label: 'Number of Ratings' },
];

export default function FighterDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();

  // State
  const [sortBy, setSortBy] = useState<SortOption>('highest-rating');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);
  // Collapse the long About body (paragraphs + love/hate) behind a "See more"
  // toggle; the short tldr stays visible.
  const [showFullAbout, setShowFullAbout] = useState(false);
  // Hype quick-view modal for upcoming fights (completed cards open their own
  // rating modal internally and never call onPress).
  const [modalFight, setModalFight] = useState<Fight | null>(null);

  // Reset image error state when fighter changes
  useEffect(() => {
    setImageLoadError(false);
  }, [id]);

  // Fetch fighter details
  const { data: fighterData, isLoading, error } = useQuery({
    queryKey: ['fighter', id],
    queryFn: () => apiService.getFighter(id as string),
    enabled: !!id,
  });

  // Fetch fighter's fights
  const { data: fightsData, isLoading: fightsLoading } = useQuery({
    queryKey: ['fighterFights', id, isAuthenticated],
    queryFn: async () => {
      const response = await apiService.getFights({
        fighterId: id as string,
        includeUserData: isAuthenticated,
        limit: 50,
      });
      return response;
    },
    enabled: !!id,
  });

  // Get highest rated fight for header display
  const highestRatedFight = useMemo(() => {
    const fights = fightsData?.fights || [];
    if (fights.length === 0) return null;

    return [...fights]
      .filter(f => f.averageRating && f.averageRating > 0)
      .sort((a: Fight, b: Fight) => (b.averageRating || 0) - (a.averageRating || 0))[0] || null;
  }, [fightsData?.fights]);

  // Separate and sort fights
  const { upcomingFights, completedFights, sortedFights } = useMemo(() => {
    const fights = fightsData?.fights || [];
    if (fights.length === 0) return { upcomingFights: [], completedFights: [], sortedFights: [] };

    // Separate into upcoming and completed
    const upcoming = fights.filter((f: Fight) => f.fightStatus !== 'COMPLETED');
    const completed = fights.filter((f: Fight) => f.fightStatus === 'COMPLETED');

    // Sort each group
    const sortUpcoming = (a: Fight, b: Fight) => {
      if (sortBy === 'newest') {
        return new Date(b.event.date).getTime() - new Date(a.event.date).getTime();
      }
      return new Date(a.event.date).getTime() - new Date(b.event.date).getTime();
    };

    const sortCompleted = (a: Fight, b: Fight) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.event.date).getTime() - new Date(a.event.date).getTime();
        case 'oldest':
          return new Date(a.event.date).getTime() - new Date(b.event.date).getTime();
        case 'highest-rating':
          return (b.averageRating || 0) - (a.averageRating || 0);
        case 'most-rated':
          return (b.totalRatings || 0) - (a.totalRatings || 0);
        default:
          return 0;
      }
    };

    const sortedUpcoming = [...upcoming].sort(sortUpcoming);
    const sortedCompleted = [...completed].sort(sortCompleted);

    // Determine order: upcoming first for 'newest', completed first for rating sorts
    const showUpcomingFirst = sortBy === 'newest';
    const allSorted = showUpcomingFirst
      ? [...sortedUpcoming, ...sortedCompleted]
      : [...sortedCompleted, ...sortedUpcoming];

    return {
      upcomingFights: sortedUpcoming,
      completedFights: sortedCompleted,
      sortedFights: allSorted,
    };
  }, [fightsData?.fights, sortBy]);

  const handleFightPress = (fight: Fight) => {
    // Upcoming fights open the hype quick-view modal (matching the event screen).
    // Anything else (e.g. an "up next" live card) still navigates to detail.
    if (fight.fightStatus === 'UPCOMING') {
      setModalFight(fight);
      return;
    }
    router.push(`/fight/${fight.id}`);
  };

  const fighter = fighterData?.fighter;

  // Hold the whole screen until BOTH the fighter and their fights are loaded.
  // Mounting the ScrollView before fights arrive means the fight cards get
  // appended to an already-laid-out ScrollView, and RN doesn't paint those
  // late children until a scroll forces a re-layout (the "fights only show
  // after I scroll" bug). The event detail screen gates on both for the same
  // reason — keep them consistent.
  if (isLoading || fightsLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
        <DetailScreenHeader title="Fighter" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.text }]}>Loading fighter...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !fighter) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
        <DetailScreenHeader title="Fighter" />
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.danger }]}>
            Error loading fighter details
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
      <DetailScreenHeader
        title="Fighter"
      />

      <ScrollView style={styles.scrollView}>
        {/* Fighter Header - Image and Info Side by Side */}
        <View style={styles.headerContainer}>
          {/* Fighter Image - Left */}
          <Image
            source={imageLoadError
              ? require('../../assets/fighters/fighter-default-alpha.png')
              : getFighterImage(fighter)
            }
            style={styles.fighterImage}
            onError={() => setImageLoadError(true)}
          />

          {/* Fighter Info - Right */}
          <View style={styles.headerInfoContainer}>
            <Text style={[styles.fighterName, { color: colors.text }]} numberOfLines={1}>
              {fighter.firstName} {fighter.lastName}
            </Text>

            {fighter.nickname && (
              <Text style={[styles.fighterNickname, { color: colors.textSecondary }]} numberOfLines={1}>
                "{fighter.nickname}"
              </Text>
            )}

            {fighter.weightClass && (
              <Text style={[styles.fighterInfoText, { color: colors.text }]} numberOfLines={1}>
                {fighter.isChampion
                  ? `${fighter.weightClass.includes('WOMENS_') ? "Women's " : ''}${fighter.weightClass.replace(/WOMENS_/g, '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())} Champion`
                  : fighter.rank
                    ? `${fighter.rank} ${fighter.weightClass.replace(/WOMENS_/g, '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}`
                    : `${fighter.weightClass.includes('WOMENS_') ? "Women's " : ''}${fighter.weightClass.replace(/WOMENS_/g, '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}`
                }
              </Text>
            )}

            {hasRecord(fighter) && (
              <Text style={[styles.fighterInfoText, { color: colors.text }]} numberOfLines={1}>
                Record: {fighter.wins}-{fighter.losses}-{fighter.draws}
              </Text>
            )}

            {isAuthenticated && (
              <FollowFighterButton
                fighterId={fighter.id}
                isFollowing={!!fighter.isFollowing}
                fighterName={`${fighter.firstName ?? ''} ${fighter.lastName ?? ''}`.trim() || undefined}
                variant="large"
                style={styles.followButton}
              />
            )}

            {typeof fighter.followerCount === 'number' && fighter.followerCount > 0 && (
              <Text style={[styles.followerCount, { color: colors.textSecondary }]} numberOfLines={1}>
                {fighter.followerCount.toLocaleString()} {fighter.followerCount === 1 ? 'fan follows' : 'fans follow'}
              </Text>
            )}
          </View>
        </View>

        {/* About — AI-enriched fighter profile (Phase 5). Confidence-gated at 0.5. */}
        {(() => {
          const conf = fighter.aiProfileConfidence ?? 0;
          const summary: string = fighter.aiProfileSummary || '';
          const profile = fighter.aiProfile || {};
          if (conf < 0.5 || (!summary && !profile.tldr)) return null;
          // Gendered "why fans love/hate" headings (him/her from DB gender),
          // falling back to the fighter's last name when gender is unknown.
          const fanPronoun = fighter.gender === 'MALE' ? 'HIM' : fighter.gender === 'FEMALE' ? 'HER' : null;
          const fanSubject = fanPronoun || (fighter.lastName ? String(fighter.lastName).toUpperCase() : 'THEM');
          const loveLabel = `WHY FANS LOVE ${fanSubject}`;
          const hateLabel = `WHY SOME FANS HATE ${fanSubject}`;
          const paragraphs = summary.split(/\n\n+/).map((p: string) => p.trim()).filter(Boolean);
          // Anything beyond the short tldr is collapsible.
          const hasMore = paragraphs.length > 0 || !!profile.whyFansLove || !!profile.whyFansHate;
          return (
            <View style={styles.aboutSection}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 8 }]}>About</Text>
              {profile.tldr ? (
                <Text style={[styles.aboutTldr, { color: colors.text }]}>{profile.tldr}</Text>
              ) : null}
              {(showFullAbout || !profile.tldr) ? (
                <>
                  {paragraphs.map((p: string, i: number) => (
                    <Text key={i} style={[styles.aboutParagraph, { color: colors.text }]}>{p}</Text>
                  ))}
                  {(profile.whyFansLove || profile.whyFansHate) ? (
                    <View style={styles.drawContainer}>
                      {profile.whyFansLove ? (
                        <View style={styles.drawBlock}>
                          <Text style={[styles.drawLabel, { color: colors.primary }]}>{loveLabel}</Text>
                          <Text style={[styles.drawText, { color: colors.text }]}>{profile.whyFansLove}</Text>
                        </View>
                      ) : null}
                      {profile.whyFansHate ? (
                        <View style={styles.drawBlock}>
                          <Text style={[styles.drawLabel, { color: colors.textSecondary }]}>{hateLabel}</Text>
                          <Text style={[styles.drawText, { color: colors.text }]}>{profile.whyFansHate}</Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </>
              ) : null}
              {/* Only offer a toggle when there's a tldr to collapse behind. */}
              {hasMore && profile.tldr ? (
                <TouchableOpacity
                  onPress={() => setShowFullAbout((v) => !v)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ marginTop: 10 }}
                >
                  <Text style={{ color: colors.primary, fontWeight: '600' }}>
                    {showFullAbout ? 'See less' : 'See more'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })()}

        {/* Fights */}
        <View style={styles.fightHistorySection}>
          <View style={styles.fightsTitleRow}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Fights
            </Text>

            {/* Sort Dropdown */}
            {sortedFights.length > 0 && (
              <TouchableOpacity
                onPress={() => setShowSortDropdown(true)}
                style={[styles.dropdownButton, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Text style={[styles.dropdownButtonText, { color: colors.text }]}>
                  {SORT_OPTIONS.find(opt => opt.value === sortBy)?.label}
                </Text>
                <FontAwesome name="chevron-down" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Dropdown Modal */}
          <Modal
            visible={showSortDropdown}
            transparent
            animationType="fade"
            onRequestClose={() => setShowSortDropdown(false)}
          >
            <TouchableOpacity
              style={styles.dropdownOverlay}
              activeOpacity={1}
              onPress={() => setShowSortDropdown(false)}
            >
              <View style={[styles.dropdownMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {SORT_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() => {
                      setSortBy(option.value);
                      setShowSortDropdown(false);
                    }}
                    style={[
                      styles.dropdownItem,
                      { borderBottomColor: colors.border },
                      sortBy === option.value && { backgroundColor: colors.primary + '20' }
                    ]}
                  >
                    <Text
                      style={[
                        styles.dropdownItemText,
                        { color: colors.text },
                        sortBy === option.value && { fontWeight: '600', color: colors.primary }
                      ]}
                    >
                      {option.label}
                    </Text>
                    {sortBy === option.value && (
                      <FontAwesome name="check" size={16} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableOpacity>
          </Modal>

          {/* Fight List */}
          {fightsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading fights...</Text>
            </View>
          ) : sortedFights.length > 0 ? (
            <View style={styles.fightsContainer}>
              {/* Upcoming fights always render first, regardless of sort.
                  Sort still controls ordering WITHIN the completed section. */}
              {upcomingFights.length > 0 && (
                <>
                  <View style={styles.columnHeadersRow}>
                    <View style={styles.columnHeadersUpcoming}>
                      <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>HYPE</Text>
                    </View>
                    <View style={styles.columnHeadersUpcomingRight}>
                      <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>MY</Text>
                      <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>HYPE</Text>
                    </View>
                  </View>
                  {upcomingFights.map((fight: Fight, index: number) => (
                    <FightDisplayCard
                      key={fight.id}
                      fight={fight}
                      onPress={() => handleFightPress(fight)}
                      showEvent={true}
                      index={index}
                    />
                  ))}
                </>
              )}

              {completedFights.length > 0 && (
                <>
                  {upcomingFights.length > 0 && <View style={{ marginTop: 20 }} />}
                  <View style={styles.columnHeadersRow}>
                    <View style={styles.columnHeadersCompleted}>
                      <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>RATING</Text>
                    </View>
                    <View style={styles.columnHeadersCompletedRight}>
                      <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>MY</Text>
                      <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>RATING</Text>
                    </View>
                  </View>
                  {completedFights.map((fight: Fight, index: number) => (
                    <FightDisplayCard
                      key={fight.id}
                      fight={fight}
                      onPress={() => handleFightPress(fight)}
                      showEvent={true}
                      index={upcomingFights.length + index}
                    />
                  ))}
                </>
              )}
            </View>
          ) : (
            <View style={styles.noFightsContainer}>
              <Text style={[styles.comingSoonText, { color: colors.textSecondary }]}>
                No fights found for this fighter.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Upcoming fight hype quick-view modal */}
      <UpcomingFightModal
        visible={!!modalFight}
        fight={modalFight}
        onClose={() => setModalFight(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
  headerContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 16,
  },
  fighterImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  headerInfoContainer: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  fighterName: {
    fontSize: 22,
    fontWeight: 'bold',
    lineHeight: 28,
  },
  fighterNickname: {
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  fighterInfoText: {
    fontSize: 14,
    lineHeight: 18,
  },
  followButton: {
    marginTop: 8,
  },
  followerCount: {
    fontSize: 12,
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  aboutSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  aboutTldr: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
    marginBottom: 10,
  },
  aboutParagraph: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 10,
  },
  drawContainer: {
    marginTop: 4,
    gap: 12,
  },
  drawBlock: {
    gap: 4,
  },
  drawLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  drawText: {
    fontSize: 14,
    lineHeight: 20,
  },
  comingSoonText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  fightHistorySection: {
    marginTop: 8,
    marginBottom: 16,
  },
  fightsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 16,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  dropdownButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownMenu: {
    width: '80%',
    maxWidth: 300,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  dropdownItemText: {
    fontSize: 16,
  },
  columnHeadersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: -2,
    paddingVertical: 8,
    marginBottom: 2,
  },
  columnHeadersUpcoming: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
    width: 60,
    marginLeft: -4,
    justifyContent: 'center',
  },
  columnHeadersUpcomingRight: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
    width: 60,
    justifyContent: 'center',
  },
  columnHeadersCompleted: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
    width: 60,
    justifyContent: 'center',
  },
  columnHeadersCompletedRight: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
    width: 60,
    justifyContent: 'center',
  },
  columnHeaderText: {
    fontSize: 11,
    fontWeight: '600',
  },
  fightsContainer: {
    gap: 0,
    paddingHorizontal: 0,
  },
  noFightsContainer: {
    padding: 20,
    alignItems: 'center',
  },
});
