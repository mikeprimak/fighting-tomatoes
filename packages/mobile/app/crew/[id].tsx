import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  Keyboard,
  KeyboardEvent,
  Dimensions,
  Modal,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/Colors';
import { FontAwesome } from '@expo/vector-icons';
import { apiService } from '../../services/api';
import { useAuth } from '../../store/AuthContext';
import { PredictionModal, RateFightModal, Fight } from '../../components';

interface Message {
  id: string;
  content: string;
  messageType: string;
  structuredData?: any;
  user: {
    id: string;
    name: string;
  };
  fight?: {
    id: string;
    matchup: string;
  };
  createdAt: string;
  isEdited: boolean;
}

interface CrewDetails {
  id: string;
  name: string;
  description?: string;
  inviteCode: string;
  totalMembers: number;
  totalMessages: number;
  allowPredictions: boolean;
  allowRoundVoting: boolean;
  allowReactions: boolean;
  userRole: string;
  members: Array<{
    id: string;
    name: string;
    role: string;
    joinedAt: string;
    messagesCount: number;
  }>;
  createdAt: string;
}

export default function CrewChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const queryClient = useQueryClient();
  const flatListRef = useRef<FlatList>(null);
  const { user } = useAuth();

  const [message, setMessage] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showFightRatingModal, setShowFightRatingModal] = useState(false);
  const [showPredictionModal, setShowPredictionModal] = useState(false);
  const [currentFight, setCurrentFight] = useState<Fight | null>(null);

  // Mock fight data for testing - using real fight ID from database
  const mockFight: Fight = {
    id: 'ce02a04d-69da-4ea4-9529-7912a967b97c', // Real fight ID from database
    scheduledRounds: 5, // This will be fetched from API in real implementation
    fighter1: {
      id: '3dd03c89-d96d-420a-91fb-8312d42a5a7f',
      firstName: 'Jon',
      lastName: 'Jones',
      nickname: 'Bones'
    },
    fighter2: {
      id: '170f0e7d-667d-448c-b065-4a01e0967d12',
      firstName: 'Stipe',
      lastName: 'Miocic'
    },
    event: {
      id: 'test-event-id',
      name: 'UFC Test Event',
      date: '2024-12-31T00:00:00.000Z',
      promotion: 'UFC'
    }
  };

  // Handle keyboard show/hide
  useEffect(() => {
    const keyboardShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event: KeyboardEvent) => {
        setKeyboardHeight(event.endCoordinates.height);
        // Scroll to bottom when keyboard shows
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    );

    const keyboardHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );

    return () => {
      keyboardShowListener?.remove();
      keyboardHideListener?.remove();
    };
  }, []);

  // Generate consistent color for each user
  const getUserColor = (userId: string): string => {
    const colors = [
      '#FF6B6B', // Red
      '#4ECDC4', // Teal
      '#45B7D1', // Blue
      '#96CEB4', // Green
      '#FFEAA7', // Yellow
      '#DDA0DD', // Plum
      '#98D8C8', // Mint
      '#F7DC6F', // Gold
      '#BB8FCE', // Purple
      '#85C1E9', // Light Blue
      '#F8C471', // Orange
      '#82E0AA', // Light Green
    ];

    // Use user ID to generate consistent color index
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return colors[Math.abs(hash) % colors.length];
  };

  // Get crew details
  const {
    data: crewData,
    isLoading: crewLoading,
    error: crewError,
  } = useQuery<{ crew: CrewDetails }>({
    queryKey: ['crew', id],
    queryFn: () => apiService.getCrew(id!),
    enabled: !!id,
  });

  // Get crew messages
  const {
    data: messagesData,
    isLoading: messagesLoading,
    error: messagesError,
    refetch: refetchMessages,
  } = useQuery<{ messages: Message[] }>({
    queryKey: ['crewMessages', id],
    queryFn: () => apiService.getCrewMessages(id!),
    enabled: !!id,
    refetchInterval: 5000, // Poll every 5 seconds for new messages
  });

  // Fetch actual fight data with user data for modals
  const {
    data: actualFightData,
    isLoading: fightLoading,
  } = useQuery<{ fight: any }>({
    queryKey: ['fight', mockFight.id, 'withUserData'],
    queryFn: () => apiService.getFight(mockFight.id),
    enabled: !!mockFight.id && (showPredictionModal || showFightRatingModal),
    staleTime: 30 * 1000, // 30 seconds
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: (content: string) =>
      apiService.sendCrewMessage(id!, { content }),
    onSuccess: () => {
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['crewMessages', id] });
      queryClient.invalidateQueries({ queryKey: ['crews'] });
      // Scroll to bottom after sending
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    },
    onError: (error: any) => {
      Alert.alert('Error', error.error || 'Failed to send message');
    },
  });


  const handleSendMessage = () => {
    if (message.trim()) {
      sendMessageMutation.mutate(message.trim());
      Keyboard.dismiss();
    }
  };

  const handleShowInvite = () => {
    setShowInviteModal(true);
  };

  const handleCopyInviteCode = () => {
    if (crew?.inviteCode) {
      // For solo testing, show alert with code
      Alert.alert(
        'Invite Code Copied!',
        `Code: ${crew.inviteCode}\n\nFor testing: Go to Crews tab > Join > Enter this code`,
        [
          {
            text: 'Share Code',
            onPress: () => handleShareInvite(),
          },
          {
            text: 'OK',
            style: 'default',
          },
        ]
      );
    }
  };

  const handleShareInvite = async () => {
    if (crew?.inviteCode) {
      try {
        await Share.share({
          message: `Join my FightCrewApp crew "${crew.name}"! Use invite code: ${crew.inviteCode}`,
          title: `Join ${crew.name} on FightCrewApp`,
        });
      } catch (error) {
        console.error('Error sharing:', error);
      }
    }
  };

  // Function to simulate a fight ending and show rating modal
  const simulateFightEnd = () => {
    // Use actual fight data with user data if available, otherwise fallback to mock
    const fightToUse = actualFightData?.fight || mockFight;
    console.log('simulateFightEnd - Using fight data:', { hasActualData: !!actualFightData?.fight, fightId: fightToUse.id });
    setCurrentFight(fightToUse);
    setShowFightRatingModal(true);
  };

  // Function to simulate pre-fight and show prediction modal
  const simulatePreFight = () => {
    // Use actual fight data with user data if available, otherwise fallback to mock
    const fightToUse = actualFightData?.fight || mockFight;
    console.log('simulatePreFight - Using fight data:', { hasActualData: !!actualFightData?.fight, fightId: fightToUse.id });
    setCurrentFight(fightToUse);
    setShowPredictionModal(true);
  };


  const closeFightRatingModal = () => {
    setShowFightRatingModal(false);
    setCurrentFight(null);
  };

  const closePredictionModal = () => {
    setShowPredictionModal(false);
    setCurrentFight(null);
  };




  const renderMessage = ({ item }: { item: Message }) => {
    const userColor = getUserColor(item.user.id);

    return (
      <View style={[styles.messageContainer, { borderLeftColor: userColor }]}>
        <View style={styles.messageHeader}>
          <Text style={[styles.userName, { color: userColor }]}>{item.user.name}</Text>
        <Text style={[styles.timestamp, { color: colors.textSecondary }]}>
          {new Date(item.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </Text>
      </View>
      <Text style={[styles.messageContent, { color: colors.text }]}>
        {item.content}
      </Text>
      {item.fight && (
        <View style={[styles.fightReference, { backgroundColor: colors.background }]}>
          <FontAwesome name="star" size={14} color={colors.tint} />
          <Text style={[styles.fightText, { color: colors.textSecondary }]}>
            {item.fight.matchup}
          </Text>
        </View>
      )}
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <FontAwesome name="comments-o" size={64} color={colors.textSecondary} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>Start the Conversation</Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
        Be the first to send a message in this crew chat!
      </Text>
    </View>
  );

  if (crewLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: colors.text }]}>Loading chat...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (crewError || !crewData) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.errorContainer}>
          <FontAwesome name="exclamation-triangle" size={48} color={colors.textSecondary} />
          <Text style={[styles.errorText, { color: colors.text }]}>Failed to load crew</Text>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: colors.tint }]}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const crew = crewData.crew;
  const messages = messagesData?.messages || [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <FontAwesome name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={[styles.crewName, { color: colors.text }]} numberOfLines={1}>
            {crew.name}
          </Text>
          <Text style={[styles.memberCount, { color: colors.textSecondary }]}>
            {crew.totalMembers} member{crew.totalMembers !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={simulatePreFight} style={styles.testButton}>
            <FontAwesome name="trophy" size={16} color={colors.tint} />
          </TouchableOpacity>
          <TouchableOpacity onPress={simulateFightEnd} style={styles.testButton}>
            <FontAwesome name="star" size={16} color={colors.tint} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShowInvite}>
            <FontAwesome name="share" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.keyboardContainer}>
        {/* Messages */}
        <View style={[styles.chatContainer, { marginBottom: keyboardHeight > 0 ? -keyboardHeight : 0 }]}>
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            contentContainerStyle={messages.length === 0 ? styles.emptyListContainer : styles.messagesContainer}
            ListEmptyComponent={renderEmptyState}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        </View>

        {/* Message Input */}
        <View style={[styles.inputContainer, {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          marginBottom: keyboardHeight
        }]}>
          <TextInput
            style={[styles.textInput, {
              backgroundColor: colors.background,
              color: colors.text,
              borderColor: colors.border
            }]}
            placeholder="Type a message..."
            placeholderTextColor={colors.textSecondary}
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={500}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendButton, {
              backgroundColor: message.trim() ? colors.tint : colors.textSecondary
            }]}
            onPress={handleSendMessage}
            disabled={!message.trim() || sendMessageMutation.isPending}
          >
            <FontAwesome
              name={sendMessageMutation.isPending ? "spinner" : "send"}
              size={16}
              color="white"
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Invite Modal */}
      <Modal
        visible={showInviteModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowInviteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.inviteModalContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.inviteModalTitle, { color: colors.text }]}>Invite to {crew?.name}</Text>

            <View style={[styles.inviteCodeContainer, { backgroundColor: colors.background }]}>
              <Text style={[styles.inviteCodeLabel, { color: colors.textSecondary }]}>Invite Code</Text>
              <Text style={[styles.inviteCodeText, { color: colors.tint }]}>{crew?.inviteCode}</Text>
            </View>

            <Text style={[styles.inviteInstructions, { color: colors.textSecondary }]}>
              Share this code with friends so they can join your crew!
            </Text>

            <Text style={[styles.testingInstructions, { color: colors.textSecondary }]}>
              💡 For solo testing: Go to Crews tab → Join → Enter this code
            </Text>

            <View style={styles.inviteModalButtons}>
              <TouchableOpacity
                style={[styles.inviteModalButton, styles.copyButton, { backgroundColor: colors.tint }]}
                onPress={handleCopyInviteCode}
              >
                <FontAwesome name="copy" size={16} color="white" />
                <Text style={styles.copyButtonText}>Copy Code</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.inviteModalButton, styles.shareButton, { backgroundColor: colors.primary }]}
                onPress={handleShareInvite}
              >
                <FontAwesome name="share" size={16} color="white" />
                <Text style={styles.shareButtonText}>Share</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.closeModalButton, { borderColor: colors.border }]}
              onPress={() => setShowInviteModal(false)}
            >
              <Text style={[styles.closeModalButtonText, { color: colors.text }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Reusable Rate Fight Modal */}
      <RateFightModal
        visible={showFightRatingModal}
        fight={currentFight}
        onClose={closeFightRatingModal}
        queryKey={['fight', mockFight.id, 'withUserData']}
      />


      {/* Reusable Prediction Modal */}
      <PredictionModal
        visible={showPredictionModal}
        onClose={closePredictionModal}
        fight={currentFight}
        crewId={id}
        onSuccess={(isUpdate) => {
          // Invalidate the fight data query to refresh user data for next modal open
          queryClient.invalidateQueries({ queryKey: ['fight', mockFight.id, 'withUserData'] });
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerInfo: {
    flex: 1,
  },
  crewName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  memberCount: {
    fontSize: 12,
    marginTop: 2,
  },
  chatContainer: {
    flex: 1,
  },
  messagesContainer: {
    padding: 16,
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyContainer: {
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
    lineHeight: 22,
  },
  messageContainer: {
    marginBottom: 16,
    paddingLeft: 12,
    borderLeftWidth: 3,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
  },
  timestamp: {
    fontSize: 12,
  },
  messageContent: {
    fontSize: 16,
    lineHeight: 22,
  },
  fightReference: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    padding: 8,
    borderRadius: 8,
  },
  fightText: {
    fontSize: 12,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 16,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  // Invite Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteModalContainer: {
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
  inviteModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  inviteCodeContainer: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  inviteCodeLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  inviteCodeText: {
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  inviteInstructions: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 22,
  },
  testingInstructions: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  inviteModalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  inviteModalButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  copyButton: {
    // backgroundColor set dynamically
  },
  copyButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  shareButton: {
    // backgroundColor set dynamically
  },
  shareButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  closeModalButton: {
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  closeModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  // Header actions
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  testButton: {
    padding: 4,
  },
  // Fight Rating Modal Styles
  fightRatingContainer: {
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
  fightRatingTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  fightInfoSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  fighterNames: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  vsText: {
    fontSize: 14,
    fontWeight: 'bold',
    marginVertical: 4,
  },
  eventInfo: {
    fontSize: 14,
    marginTop: 8,
  },
  starsSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  ratingLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 8,
  },
  starButton: {
    padding: 4,
  },
  star: {
    fontSize: 24,
  },
  ratingHint: {
    fontSize: 14,
    textAlign: 'center',
  },
  fightRatingButtons: {
    alignItems: 'center',
  },
  dismissButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  dismissButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  submitButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  // Prediction Modal Styles
  predictionContainer: {
    width: '95%',
    maxWidth: 450,
    maxHeight: '90%',
    padding: 20,
    borderRadius: 16,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  predictionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  predictionSection: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  selectionHint: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  fighterButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  fighterButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  fighterButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  roundButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  methodButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  methodButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  methodButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  predictionButtons: {
    alignItems: 'center',
    marginTop: 8,
  },
});