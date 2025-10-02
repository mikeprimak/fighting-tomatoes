import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { Colors } from '../../../constants/Colors';
import { FontAwesome } from '@expo/vector-icons';
import { apiService } from '../../../services/api';
import { useCustomAlert } from '../../../hooks/useCustomAlert';
import { CustomAlert } from '../../../components/CustomAlert';

export default function CrewInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [selectedMemberForRemoval, setSelectedMemberForRemoval] = useState<string | null>(null);
  const [showRemoveMemberDialog, setShowRemoveMemberDialog] = useState(false);
  const [showMemberRemovedDialog, setShowMemberRemovedDialog] = useState(false);
  const [removedMemberName, setRemovedMemberName] = useState<string>('');
  const queryClient = useQueryClient();
  const { alertState, showError, hideAlert } = useCustomAlert();

  const { data: crewData, isLoading } = useQuery({
    queryKey: ['crew', id],
    queryFn: () => apiService.getCrew(id!),
    enabled: !!id,
  });

  const deleteCrewMutation = useMutation({
    mutationFn: () => apiService.deleteCrew(id!),
    onSuccess: () => {
      // Show success dialog
      setShowSuccessDialog(true);
      // Remove all cached data for this crew
      queryClient.removeQueries({ queryKey: ['crew', id] });
      queryClient.removeQueries({ queryKey: ['crewMessages', id] });
      // Invalidate crews list to refresh it
      queryClient.invalidateQueries({ queryKey: ['crews'] });
      // Navigate back after showing success message
      setTimeout(() => {
        router.replace('/(tabs)/profile');
      }, 1500);
    },
    onError: (error: any) => {
      showError(
        error.error || 'Failed to delete crew. Please try again.',
        'Error'
      );
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: ({ memberId, block }: { memberId: string; block: boolean }) =>
      apiService.removeCrewMember(id!, memberId, block),
    onSuccess: () => {
      setShowRemoveMemberDialog(false);
      setShowMemberRemovedDialog(true);
      // Invalidate crew data to refresh member list
      queryClient.invalidateQueries({ queryKey: ['crew', id] });
      queryClient.invalidateQueries({ queryKey: ['crewMessages', id] });
      // Auto-dismiss after 1.5 seconds
      setTimeout(() => {
        setShowMemberRemovedDialog(false);
        setSelectedMemberForRemoval(null);
        setRemovedMemberName('');
      }, 1500);
    },
    onError: (error: any) => {
      showError(
        error.error || 'Failed to remove member. Please try again.',
        'Error'
      );
    },
  });

  const crew = crewData?.crew;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getTimeSinceCreation = (dateString: string) => {
    const created = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - created.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 7) {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
    } else if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} week${weeks !== 1 ? 's' : ''}`;
    } else if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months} month${months !== 1 ? 's' : ''}`;
    } else {
      const years = Math.floor(diffDays / 365);
      return `${years} year${years !== 1 ? 's' : ''}`;
    }
  };

  if (isLoading || !crew) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={{ color: colors.text }}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const leader = crew.members.find((m) => m.role === 'LEADER');
  const sortedMembers = [...crew.members].sort((a, b) => {
    if (a.role === 'LEADER') return -1;
    if (b.role === 'LEADER') return 1;
    return b.messagesCount - a.messagesCount;
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <FontAwesome name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Crew Info</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Crew Name & Description */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.crewName, { color: colors.text }]}>{crew.name}</Text>
          {crew.description && (
            <Text style={[styles.crewDescription, { color: colors.textSecondary }]}>
              {crew.description}
            </Text>
          )}
        </View>

        {/* Stats Section */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Stats</Text>

          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <FontAwesome name="users" size={24} color={colors.tint} />
              <Text style={[styles.statValue, { color: colors.text }]}>{crew.totalMembers}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Members</Text>
            </View>

            <View style={styles.statItem}>
              <FontAwesome name="comments" size={24} color={colors.tint} />
              <Text style={[styles.statValue, { color: colors.text }]}>{crew.totalMessages}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Messages</Text>
            </View>

            <View style={styles.statItem}>
              <FontAwesome name="clock-o" size={24} color={colors.tint} />
              <Text style={[styles.statValue, { color: colors.text }]}>
                {getTimeSinceCreation(crew.createdAt)}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Age</Text>
            </View>
          </View>

          <View style={[styles.infoRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Created</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>
              {formatDate(crew.createdAt)}
            </Text>
          </View>

          <View style={[styles.infoRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Invite Code</Text>
            <Text style={[styles.infoValue, { color: colors.tint, fontWeight: '600' }]}>
              {crew.inviteCode}
            </Text>
          </View>
        </View>

        {/* Leader Section */}
        {leader && (
          <View style={[styles.section, { backgroundColor: colors.card }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Leader</Text>
            <View style={[styles.memberCard, { backgroundColor: colors.background }]}>
              <View style={styles.memberInfo}>
                <FontAwesome name="star" size={16} color="#f59e0b" style={{ marginRight: 8 }} />
                <Text style={[styles.memberName, { color: colors.text }]}>{leader.name}</Text>
              </View>
              <Text style={[styles.memberMessages, { color: colors.textSecondary }]}>
                {leader.messagesCount} messages
              </Text>
            </View>
          </View>
        )}

        {/* Members Section */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Members ({crew.totalMembers})
          </Text>

          {sortedMembers.map((member, index) => (
            <TouchableOpacity
              key={member.id}
              style={[
                styles.memberCard,
                {
                  backgroundColor: selectedMemberForRemoval === member.id ? colors.danger + '20' : colors.background
                },
                index === sortedMembers.length - 1 && { marginBottom: 0 },
              ]}
              onLongPress={() => {
                // Only allow owner to select non-owner members
                if (crew.userRole === 'OWNER' && member.role !== 'OWNER') {
                  setSelectedMemberForRemoval(member.id);
                }
              }}
              onPress={() => {
                // Clear selection if tapping away
                if (selectedMemberForRemoval) {
                  setSelectedMemberForRemoval(null);
                }
              }}
              activeOpacity={crew.userRole === 'OWNER' && member.role !== 'OWNER' ? 0.7 : 1}
            >
              <View style={styles.memberInfo}>
                {member.role === 'LEADER' && (
                  <FontAwesome name="star" size={16} color="#f59e0b" style={{ marginRight: 8 }} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.memberName, { color: colors.text }]}>
                    {member.name}
                  </Text>
                  <Text style={[styles.memberJoinedDate, { color: colors.textSecondary }]}>
                    Joined {formatDate(member.joinedAt)}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {selectedMemberForRemoval === member.id && (
                  <TouchableOpacity
                    onPress={() => setShowRemoveMemberDialog(true)}
                    style={{ padding: 8 }}
                  >
                    <FontAwesome name="trash" size={20} color={colors.danger} />
                  </TouchableOpacity>
                )}
                <Text style={[styles.memberMessages, { color: colors.textSecondary }]}>
                  {member.messagesCount} messages
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Features Section */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Features</Text>

          <View style={styles.featureRow}>
            <FontAwesome
              name={crew.allowPredictions ? 'check-circle' : 'times-circle'}
              size={20}
              color={crew.allowPredictions ? '#10b981' : colors.textSecondary}
            />
            <Text style={[styles.featureText, { color: colors.text }]}>Predictions</Text>
          </View>

          <View style={styles.featureRow}>
            <FontAwesome
              name={crew.allowRoundVoting ? 'check-circle' : 'times-circle'}
              size={20}
              color={crew.allowRoundVoting ? '#10b981' : colors.textSecondary}
            />
            <Text style={[styles.featureText, { color: colors.text }]}>Round Voting</Text>
          </View>

          <View style={styles.featureRow}>
            <FontAwesome
              name={crew.allowReactions ? 'check-circle' : 'times-circle'}
              size={20}
              color={crew.allowReactions ? '#10b981' : colors.textSecondary}
            />
            <Text style={[styles.featureText, { color: colors.text }]}>Reactions</Text>
          </View>
        </View>

        {/* Delete Crew Section (Only for Owner) */}
        {crew.userRole === 'OWNER' && (
          <View style={[styles.section, { backgroundColor: colors.card }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Danger Zone</Text>
            <TouchableOpacity
              style={[styles.deleteButton, { borderColor: colors.danger }]}
              onPress={() => setShowDeleteDialog(true)}
            >
              <FontAwesome name="trash" size={20} color={colors.danger} />
              <Text style={[styles.deleteButtonText, { color: colors.danger }]}>
                Delete Crew
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Delete Crew Confirmation Modal */}
      <Modal
        visible={showDeleteDialog}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDeleteDialog(false)}
      >
        <TouchableOpacity
          style={styles.deleteDialogOverlay}
          activeOpacity={1}
          onPress={() => setShowDeleteDialog(false)}
        >
          <TouchableOpacity
            style={[styles.deleteDialogContainer, { backgroundColor: colors.card }]}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.deleteDialogHeader}>
              <FontAwesome name="exclamation-triangle" size={48} color={colors.danger} />
            </View>

            <Text style={[styles.deleteDialogTitle, { color: colors.text }]}>Delete Crew</Text>
            <Text style={[styles.deleteDialogMessage, { color: colors.textSecondary }]}>
              Are you sure you want to permanently delete "{crew?.name}"?
            </Text>
            <Text style={[styles.deleteDialogWarning, { color: colors.textSecondary }]}>
              This action cannot be undone and will remove all messages and data.
            </Text>

            <View style={styles.deleteDialogButtons}>
              <TouchableOpacity
                style={[styles.deleteDialogButton, { borderTopColor: colors.border }]}
                onPress={() => setShowDeleteDialog(false)}
              >
                <Text style={[styles.deleteDialogButtonText, { color: colors.text, fontWeight: '600' }]}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.deleteDialogButton, { borderTopColor: colors.border }]}
                onPress={() => {
                  setShowDeleteDialog(false);
                  deleteCrewMutation.mutate();
                }}
              >
                <Text style={[styles.deleteDialogButtonText, { color: colors.danger, fontWeight: '600' }]}>
                  Delete Crew
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Success Dialog */}
      <Modal
        visible={showSuccessDialog}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.successDialogOverlay}>
          <View style={[styles.successDialogContainer, { backgroundColor: colors.card }]}>
            <View style={styles.successDialogHeader}>
              <FontAwesome name="check-circle" size={64} color="#10b981" />
            </View>
            <Text style={[styles.successDialogTitle, { color: colors.text }]}>
              Crew Successfully Deleted
            </Text>
          </View>
        </View>
      </Modal>

      {/* Remove Member Confirmation Modal */}
      <Modal
        visible={showRemoveMemberDialog}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowRemoveMemberDialog(false);
          setSelectedMemberForRemoval(null);
        }}
      >
        <TouchableOpacity
          style={styles.deleteDialogOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowRemoveMemberDialog(false);
            setSelectedMemberForRemoval(null);
          }}
        >
          <TouchableOpacity
            style={[styles.deleteDialogContainer, { backgroundColor: colors.card }]}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.deleteDialogHeader}>
              <FontAwesome name="user-times" size={48} color={colors.danger} />
            </View>

            <Text style={[styles.deleteDialogTitle, { color: colors.text }]}>Remove Member</Text>
            <Text style={[styles.deleteDialogMessage, { color: colors.textSecondary }]}>
              Are you sure you want to remove this user from the crew?
            </Text>

            <View style={styles.deleteDialogButtons}>
              <TouchableOpacity
                style={[styles.deleteDialogButton, { borderTopColor: colors.border }]}
                onPress={() => {
                  setShowRemoveMemberDialog(false);
                  setSelectedMemberForRemoval(null);
                }}
              >
                <Text style={[styles.deleteDialogButtonText, { color: colors.text, fontWeight: '600' }]}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.deleteDialogButton, { borderTopColor: colors.border }]}
                onPress={() => {
                  if (selectedMemberForRemoval && crew) {
                    const member = crew.members.find(m => m.id === selectedMemberForRemoval);
                    if (member) {
                      setRemovedMemberName(member.name);
                      removeMemberMutation.mutate({ memberId: selectedMemberForRemoval, block: false });
                    }
                  }
                }}
              >
                <Text style={[styles.deleteDialogButtonText, { color: colors.danger, fontWeight: '600' }]}>
                  Remove
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.deleteDialogButton, { borderTopColor: colors.border }]}
                onPress={() => {
                  if (selectedMemberForRemoval && crew) {
                    const member = crew.members.find(m => m.id === selectedMemberForRemoval);
                    if (member) {
                      setRemovedMemberName(member.name);
                      removeMemberMutation.mutate({ memberId: selectedMemberForRemoval, block: true });
                    }
                  }
                }}
              >
                <Text style={[styles.deleteDialogButtonText, { color: colors.danger, fontWeight: 'bold' }]}>
                  Remove and Block
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Member Removed Success Dialog */}
      <Modal
        visible={showMemberRemovedDialog}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.successDialogOverlay}>
          <View style={[styles.successDialogContainer, { backgroundColor: colors.card }]}>
            <View style={styles.successDialogHeader}>
              <FontAwesome name="check-circle" size={64} color="#10b981" />
            </View>
            <Text style={[styles.successDialogTitle, { color: colors.text }]}>
              {removedMemberName} has been removed
            </Text>
          </View>
        </View>
      </Modal>
      <CustomAlert {...alertState} onDismiss={hideAlert} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
    margin: -8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  section: {
    marginTop: 12,
    marginHorizontal: 12,
    padding: 16,
    borderRadius: 12,
  },
  crewName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  crewDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
    gap: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  infoLabel: {
    fontSize: 14,
  },
  infoValue: {
    fontSize: 14,
  },
  memberCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '500',
  },
  memberJoinedDate: {
    fontSize: 12,
    marginTop: 2,
  },
  memberMessages: {
    fontSize: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  featureText: {
    fontSize: 16,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  deleteDialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  deleteDialogContainer: {
    borderRadius: 12,
    width: '100%',
    maxWidth: 340,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  deleteDialogHeader: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 16,
  },
  deleteDialogTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  deleteDialogMessage: {
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  deleteDialogWarning: {
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    fontStyle: 'italic',
  },
  deleteDialogButtons: {
    borderTopWidth: 0,
  },
  deleteDialogButton: {
    paddingVertical: 16,
    alignItems: 'center',
    borderTopWidth: 1,
  },
  deleteDialogButtonText: {
    fontSize: 16,
  },
  successDialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  successDialogContainer: {
    borderRadius: 12,
    width: '100%',
    maxWidth: 300,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  successDialogHeader: {
    marginBottom: 20,
  },
  successDialogTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
