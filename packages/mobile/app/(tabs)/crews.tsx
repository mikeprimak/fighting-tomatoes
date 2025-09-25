import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { FontAwesome } from '@expo/vector-icons';
import { apiService } from '../../services/api';
import { useAuth } from '../../store/AuthContext';

interface Crew {
  id: string;
  name: string;
  description?: string;
  totalMembers: number;
  totalMessages: number;
  lastMessageAt: string;
  role: string;
  joinedAt: string;
}

interface CrewsResponse {
  crews: Crew[];
}

export default function CrewsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();

  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [crewName, setCrewName] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  const {
    data: crewsData,
    isLoading,
    error,
    refetch,
  } = useQuery<CrewsResponse>({
    queryKey: ['crews'],
    queryFn: () => apiService.getCrews(),
    enabled: isAuthenticated,
    staleTime: 30 * 1000, // 30 seconds
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const showCreateCrewDialog = () => {
    setCrewName('');
    setShowCreateModal(true);
  };

  const showJoinCrewDialog = () => {
    setInviteCode('');
    setShowJoinModal(true);
  };

  const handleCreateCrew = () => {
    if (crewName.trim()) {
      createCrew(crewName.trim());
      setShowCreateModal(false);
      setCrewName('');
    } else {
      Alert.alert('Error', 'Please enter a crew name');
    }
  };

  const handleJoinCrew = () => {
    if (inviteCode.trim().length === 6) {
      joinCrew(inviteCode.trim().toUpperCase());
      setShowJoinModal(false);
      setInviteCode('');
    } else {
      Alert.alert('Error', 'Please enter a valid 6-character invite code');
    }
  };

  const createCrewMutation = useMutation({
    mutationFn: (name: string) =>
      apiService.createCrew({ name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crews'] });
      Alert.alert('Success', 'Crew created successfully!');
    },
    onError: (error: any) => {
      Alert.alert('Error', error.error || error.message || 'Failed to create crew');
    },
  });

  const joinCrewMutation = useMutation({
    mutationFn: (inviteCode: string) =>
      apiService.joinCrew(inviteCode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crews'] });
      Alert.alert('Success', 'Successfully joined crew!');
    },
    onError: (error: any) => {
      Alert.alert('Error', error.error || error.message || 'Failed to join crew');
    },
  });

  const createCrew = (name: string) => {
    createCrewMutation.mutate(name);
  };

  const joinCrew = (inviteCode: string) => {
    joinCrewMutation.mutate(inviteCode);
  };

  const renderCrewItem = ({ item }: { item: Crew }) => (
    <TouchableOpacity
      style={[styles.crewCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => {
        router.push(`/crew/${item.id}`);
      }}
    >
      <View style={styles.crewHeader}>
        <View style={styles.crewInfo}>
          <Text style={[styles.crewName, { color: colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          {item.description && (
            <Text style={[styles.crewDescription, { color: colors.textSecondary }]} numberOfLines={2}>
              {item.description}
            </Text>
          )}
        </View>
        <View style={styles.crewBadge}>
          <FontAwesome name="comments" size={20} color={colors.tint} />
        </View>
      </View>

      <View style={styles.crewStats}>
        <View style={styles.statItem}>
          <FontAwesome name="users" size={14} color={colors.textSecondary} />
          <Text style={[styles.statText, { color: colors.textSecondary }]}>
            {item.totalMembers} member{item.totalMembers !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={styles.statItem}>
          <FontAwesome name="comment" size={14} color={colors.textSecondary} />
          <Text style={[styles.statText, { color: colors.textSecondary }]}>
            {item.totalMessages} message{item.totalMessages !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={styles.statItem}>
          <FontAwesome name="star" size={14} color={colors.tint} />
          <Text style={[styles.roleText, { color: colors.tint }]}>
            {item.role}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <FontAwesome name="comments-o" size={64} color={colors.textSecondary} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No Crews Yet</Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
        Create a crew or join one with an invite code to get started!
      </Text>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={[styles.loadingText, { color: colors.text }]}>Loading crews...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.errorContainer}>
          <FontAwesome name="exclamation-triangle" size={48} color={colors.textSecondary} />
          <Text style={[styles.errorText, { color: colors.text }]}>Failed to load crews</Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.tint }]}
            onPress={() => refetch()}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const crews = crewsData?.crews || [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>My Crews</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={[styles.headerButton, { backgroundColor: colors.tint }]}
            onPress={showJoinCrewDialog}
            disabled={joinCrewMutation.isPending}
          >
            <FontAwesome name="plus" size={16} color="white" />
            <Text style={styles.headerButtonText}>Join</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerButton, { backgroundColor: colors.tint }]}
            onPress={showCreateCrewDialog}
            disabled={createCrewMutation.isPending}
          >
            <FontAwesome name="group" size={16} color="white" />
            <Text style={styles.headerButtonText}>Create</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={crews}
        renderItem={renderCrewItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={crews.length === 0 ? styles.emptyListContainer : styles.listContainer}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.tint}
            colors={[colors.tint]}
          />
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Create Crew Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Create New Crew</Text>
            <TextInput
              style={[styles.modalInput, {
                backgroundColor: colors.background,
                color: colors.text,
                borderColor: colors.border
              }]}
              placeholder="Enter crew name"
              placeholderTextColor={colors.textSecondary}
              value={crewName}
              onChangeText={setCrewName}
              maxLength={50}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton, { borderColor: colors.border }]}
                onPress={() => setShowCreateModal(false)}
              >
                <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.createButton, { backgroundColor: colors.tint }]}
                onPress={handleCreateCrew}
                disabled={createCrewMutation.isPending}
              >
                <Text style={styles.createButtonText}>
                  {createCrewMutation.isPending ? 'Creating...' : 'Create'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Join Crew Modal */}
      <Modal
        visible={showJoinModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowJoinModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Join Crew</Text>
            <TextInput
              style={[styles.modalInput, {
                backgroundColor: colors.background,
                color: colors.text,
                borderColor: colors.border
              }]}
              placeholder="Enter 6-character invite code"
              placeholderTextColor={colors.textSecondary}
              value={inviteCode}
              onChangeText={setInviteCode}
              maxLength={6}
              autoCapitalize="characters"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton, { borderColor: colors.border }]}
                onPress={() => setShowJoinModal(false)}
              >
                <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.joinButton, { backgroundColor: colors.tint }]}
                onPress={handleJoinCrew}
                disabled={joinCrewMutation.isPending}
              >
                <Text style={styles.joinButtonText}>
                  {joinCrewMutation.isPending ? 'Joining...' : 'Join'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  headerButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
  },
  emptyListContainer: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '500',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 32,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 22,
  },
  crewCard: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  crewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  crewInfo: {
    flex: 1,
    marginRight: 12,
  },
  crewName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  crewDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  crewBadge: {
    padding: 8,
  },
  crewStats: {
    flexDirection: 'row',
    gap: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    fontWeight: '500',
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '90%',
    maxWidth: 400,
    padding: 24,
    borderRadius: 16,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  createButton: {
    // backgroundColor set dynamically
  },
  createButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  joinButton: {
    // backgroundColor set dynamically
  },
  joinButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});