import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../store/AuthContext';

interface Fighter {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  record?: string;
}

interface Event {
  id: string;
  name: string;
  shortName: string;
  date: string;
  organization: {
    name: string;
    shortName: string;
  };
}

interface Fight {
  id: string;
  fightOrder: number;
  weightClass?: string;
  isTitle: boolean;
  result?: string;
  winner?: string;
  fighterA: Fighter;
  fighterB: Fighter;
  event: Event;
  averageRating?: number;
  totalRatings?: number;
  userRating?: {
    id: string;
    rating: number;
    comment?: string;
  };
}

const API_BASE_URL = 'http://10.0.0.53:3001/api';

export default function FightsScreen() {
  const [selectedFight, setSelectedFight] = useState<Fight | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [showRatingModal, setShowRatingModal] = useState(false);
  
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: fights,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['fights'],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      const response = await fetch(`${API_BASE_URL}/fights?limit=50`, {
        headers,
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch fights');
      }
      
      const data = await response.json();
      return data.fights as Fight[];
    },
  });

  const rateFightMutation = useMutation({
    mutationFn: async ({ fightId, rating, comment }: { fightId: string; rating: number; comment?: string }) => {
      const response = await fetch(`${API_BASE_URL}/fights/${fightId}/rate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ rating, comment }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to rate fight');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fights'] });
      setShowRatingModal(false);
      setRating(0);
      setComment('');
      Alert.alert('Success', 'Fight rated successfully!');
    },
    onError: (error) => {
      Alert.alert('Error', error.message);
    },
  });

  const getFighterName = (fighter: Fighter) => {
    const name = `${fighter.firstName} ${fighter.lastName}`;
    return fighter.nickname ? `${name} "${fighter.nickname}"` : name;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const openRatingModal = (fight: Fight) => {
    setSelectedFight(fight);
    if (fight.userRating) {
      setRating(fight.userRating.rating);
      setComment(fight.userRating.comment || '');
    } else {
      setRating(0);
      setComment('');
    }
    setShowRatingModal(true);
  };

  const submitRating = () => {
    if (!selectedFight || rating === 0) {
      Alert.alert('Error', 'Please select a rating from 1-10');
      return;
    }

    rateFightMutation.mutate({
      fightId: selectedFight.id,
      rating,
      comment: comment.trim() || undefined,
    });
  };

  const renderRatingStars = (currentRating: number, onPress?: (rating: number) => void) => {
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={() => onPress?.(star)}
            disabled={!onPress}
            style={styles.starButton}
          >
            <Text style={[
              styles.star,
              { color: star <= currentRating ? colors.primary : colors.textSecondary }
            ]}>
              {star <= currentRating ? '★' : '☆'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderFightCard = ({ item: fight }: { item: Fight }) => (
    <TouchableOpacity
      style={[styles.fightCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => openRatingModal(fight)}
    >
      <View style={styles.fightHeader}>
        <View style={styles.eventInfo}>
          <Text style={[styles.eventName, { color: colors.textSecondary }]}>
            {fight.event.shortName} • {formatDate(fight.event.date)}
          </Text>
          {fight.isTitle && (
            <Text style={[styles.titleBadge, { color: colors.primary }]}>TITLE FIGHT</Text>
          )}
        </View>
        <Text style={[styles.orgBadge, { color: colors.primary }]}>
          {fight.event.organization.shortName}
        </Text>
      </View>

      <View style={styles.fightersContainer}>
        <View style={styles.fighter}>
          <Text style={[styles.fighterName, { color: colors.text }]}>
            {getFighterName(fight.fighterA)}
          </Text>
          {fight.fighterA.record && (
            <Text style={[styles.record, { color: colors.textSecondary }]}>
              {fight.fighterA.record}
            </Text>
          )}
        </View>

        <View style={styles.vsContainer}>
          <Text style={[styles.vs, { color: colors.textSecondary }]}>VS</Text>
          {fight.weightClass && (
            <Text style={[styles.weightClass, { color: colors.textSecondary }]}>
              {fight.weightClass}
            </Text>
          )}
        </View>

        <View style={styles.fighter}>
          <Text style={[styles.fighterName, { color: colors.text }]}>
            {getFighterName(fight.fighterB)}
          </Text>
          {fight.fighterB.record && (
            <Text style={[styles.record, { color: colors.textSecondary }]}>
              {fight.fighterB.record}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.ratingSection}>
        {fight.userRating ? (
          <View style={styles.userRatingContainer}>
            <Text style={[styles.yourRating, { color: colors.primary }]}>
              Your Rating: {fight.userRating.rating}/10 ⭐
            </Text>
            {fight.userRating.comment && (
              <Text style={[styles.yourComment, { color: colors.textSecondary }]}>
                "{fight.userRating.comment}"
              </Text>
            )}
          </View>
        ) : (
          <Text style={[styles.ratePrompt, { color: colors.primary }]}>
            Tap to Rate This Fight
          </Text>
        )}

        {fight.averageRating && (
          <View style={styles.avgRatingContainer}>
            <Text style={[styles.avgRating, { color: colors.text }]}>
              ⭐ {fight.averageRating}/10
            </Text>
            <Text style={[styles.ratingCount, { color: colors.textSecondary }]}>
              ({fight.totalRatings} rating{fight.totalRatings !== 1 ? 's' : ''})
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Rate Fights</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Share your opinion on the best fights
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={fights || []}
          keyExtractor={(item) => item.id}
          renderItem={renderFightCard}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Rating Modal */}
      <Modal
        visible={showRatingModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowRatingModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => setShowRatingModal(false)}
                style={styles.closeButton}
              >
                <Text style={[styles.closeText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Rate Fight</Text>
              <TouchableOpacity
                onPress={submitRating}
                disabled={rating === 0 || rateFightMutation.isPending}
                style={[styles.saveButton, rating === 0 && styles.saveButtonDisabled]}
              >
                <Text style={[styles.saveText, { color: colors.primary }]}>
                  {rateFightMutation.isPending ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>

            {selectedFight && (
              <>
                <View style={styles.fightInfo}>
                  <Text style={[styles.modalFightTitle, { color: colors.text }]}>
                    {getFighterName(selectedFight.fighterA)} vs {getFighterName(selectedFight.fighterB)}
                  </Text>
                  <Text style={[styles.modalEventInfo, { color: colors.textSecondary }]}>
                    {selectedFight.event.shortName} • {formatDate(selectedFight.event.date)}
                  </Text>
                </View>

                <View style={styles.ratingInputSection}>
                  <Text style={[styles.ratingLabel, { color: colors.text }]}>
                    How entertaining was this fight? (1-10)
                  </Text>
                  {renderRatingStars(rating, setRating)}
                  <Text style={[styles.ratingValue, { color: colors.primary }]}>
                    {rating > 0 ? `${rating}/10` : 'Select a rating'}
                  </Text>
                </View>

                <View style={styles.commentSection}>
                  <Text style={[styles.commentLabel, { color: colors.text }]}>
                    Comment (Optional)
                  </Text>
                  <TextInput
                    style={[styles.commentInput, { 
                      backgroundColor: colors.card, 
                      borderColor: colors.border,
                      color: colors.text 
                    }]}
                    value={comment}
                    onChangeText={setComment}
                    placeholder="What did you think of this fight?"
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                </View>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    padding: 16,
    paddingTop: 0,
  },
  fightCard: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  fightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  eventInfo: {
    flex: 1,
  },
  eventName: {
    fontSize: 12,
    marginBottom: 2,
  },
  titleBadge: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  orgBadge: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  fightersContainer: {
    marginBottom: 12,
  },
  fighter: {
    alignItems: 'center',
    marginBottom: 8,
  },
  fighterName: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  record: {
    fontSize: 12,
    marginTop: 2,
  },
  vsContainer: {
    alignItems: 'center',
    marginVertical: 8,
  },
  vs: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  weightClass: {
    fontSize: 10,
    marginTop: 2,
  },
  ratingSection: {
    alignItems: 'center',
  },
  userRatingContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  yourRating: {
    fontSize: 14,
    fontWeight: '600',
  },
  yourComment: {
    fontSize: 12,
    marginTop: 4,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  ratePrompt: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  avgRatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avgRating: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 4,
  },
  ratingCount: {
    fontSize: 12,
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
  },
  modalContent: {
    flexGrow: 1,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    fontSize: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  saveButton: {
    padding: 8,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
  },
  fightInfo: {
    alignItems: 'center',
    marginBottom: 32,
  },
  modalFightTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalEventInfo: {
    fontSize: 14,
  },
  ratingInputSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  ratingLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  starsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 16,
  },
  starButton: {
    padding: 4,
  },
  star: {
    fontSize: 24,
  },
  ratingValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  commentSection: {
    marginBottom: 32,
  },
  commentLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  commentInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 100,
  },
});