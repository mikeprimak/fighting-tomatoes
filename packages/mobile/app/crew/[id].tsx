import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Keyboard,
  KeyboardEvent,
  Dimensions,
  Modal,
  Share,
  Image,
  KeyboardAvoidingView,
  ScrollView,
  Animated,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/Colors';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { apiService } from '../../services/api';
import { useAuth } from '../../store/AuthContext';
import { useVerification } from '../../store/VerificationContext';
import { RoundVotingSlideup, Fight, FightDisplayCardMinimal } from '../../components';
import { GifPickerModal } from '../../components/GifPickerModal';
import { useCustomAlert } from '../../hooks/useCustomAlert';
import { getDefaultBanner } from '../../utils/defaultBanners';
import { PromotionLogo } from '../../components/PromotionLogo';
import { CustomAlert } from '../../components/CustomAlert';

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
  reactions?: {
    emoji: string;
    users: Array<{
      id: string;
      name: string;
    }>;
    count: number;
  }[];
  createdAt: string;
  isEdited: boolean;
}

interface CrewDetails {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  inviteCode: string;
  totalMembers: number;
  totalMessages: number;
  allowPredictions: boolean;
  allowRoundVoting: boolean;
  allowReactions: boolean;
  followOnlyUFC: boolean;
  userRole: string;
  isMuted: boolean;
  mutedUntil?: string | null;
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
  const textInputRef = useRef<TextInput>(null);
  const { user } = useAuth();
  const { requireVerification } = useVerification();
  const { alertState, showSuccess, showError, hideAlert } = useCustomAlert();


  const [message, setMessage] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showFightRatingModal, setShowFightRatingModal] = useState(false);
  const [showPredictionModal, setShowPredictionModal] = useState(false);
  const [showRoundVoting, setShowRoundVoting] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [currentFight, setCurrentFight] = useState<Fight | null>(null);
  const [currentRound, setCurrentRound] = useState(1);
  const [showReactionMenu, setShowReactionMenu] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [reactionMenuPosition, setReactionMenuPosition] = useState({ x: 0, y: 0 });
  const [localReactions, setLocalReactions] = useState<Record<string, any[]>>({});
  const [showReactionUsers, setShowReactionUsers] = useState(false);
  const [selectedReactionData, setSelectedReactionData] = useState<any[]>([]);
  const [showFightCard, setShowFightCard] = useState(false);
  const [selectedMessageForDeletion, setSelectedMessageForDeletion] = useState<string | null>(null);
  const [showCrewMenu, setShowCrewMenu] = useState(false);
  const [showMuteDialog, setShowMuteDialog] = useState(false);
  const [showCodeCopiedToast, setShowCodeCopiedToast] = useState(false);
  const [eventBannerAspectRatio, setEventBannerAspectRatio] = useState<number>(16 / 9);
  const fightCardSlideAnim = useRef(new Animated.Value(-1000)).current;

  // Calculate padding lines for consistent section heights
  const getStatusPaddingLines = (baseText: string, maxLines: number = 3) => {
    if (!showFightCard) return '';

    // Estimate lines based on text length (rough approximation)
    const eventText = fightCardData?.event?.name || "UFC Event";
    const estimatedEventLines = Math.max(1, Math.ceil(eventText.length / 25)); // ~25 chars per line
    const currentLines = Math.max(1, Math.ceil(baseText.length / 25));
    const paddingNeeded = Math.max(0, estimatedEventLines - currentLines);

    return '\n'.repeat(paddingNeeded);
  };

  // Initialize animation position
  useEffect(() => {
    fightCardSlideAnim.setValue(showFightCard ? 0 : -1000);
  }, []);

  // Storage keys for persistent reactions
  const REACTIONS_STORAGE_KEY = `crew_reactions_${id}`;

  // Load reactions from AsyncStorage on component mount
  useEffect(() => {
    const loadStoredReactions = async () => {
      try {
        const storedReactions = await AsyncStorage.getItem(REACTIONS_STORAGE_KEY);
        if (storedReactions) {
          const parsedReactions = JSON.parse(storedReactions);
          console.log('Loaded stored reactions:', parsedReactions);
          setLocalReactions(parsedReactions);
        }
      } catch (error) {
        console.error('Error loading stored reactions:', error);
      }
    };

    if (id) {
      loadStoredReactions();
    }
  }, [id]);

  // Save reactions to AsyncStorage whenever localReactions changes
  useEffect(() => {
    const saveReactions = async () => {
      try {
        if (Object.keys(localReactions).length > 0) {
          await AsyncStorage.setItem(REACTIONS_STORAGE_KEY, JSON.stringify(localReactions));
          console.log('Saved reactions to storage:', Object.keys(localReactions).length, 'messages');
        } else {
          // Remove storage key if no reactions to prevent clutter
          await AsyncStorage.removeItem(REACTIONS_STORAGE_KEY);
          console.log('Removed empty reactions storage');
        }
      } catch (error) {
        console.error('Error saving reactions:', error);
      }
    };

    // Save whenever reactions change
    saveReactions();
  }, [localReactions, REACTIONS_STORAGE_KEY]);

  // Manual keyboard height tracking
  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event) => {
        setKeyboardHeight(event.endCoordinates.height);
      }
    );

    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );

    return () => {
      showSubscription?.remove();
      hideSubscription?.remove();
      // Ensure keyboard is dismissed when leaving screen
      Keyboard.dismiss();
      setMessage('');
      setKeyboardHeight(0);
    };
  }, []);


  // Fetch upcoming event data - runs independently of crew data
  const { data: fightCardData, isLoading: eventLoading } = useQuery({
    queryKey: ['upcomingEvent'],
    queryFn: async () => {
      console.log('🔍 [EVENT QUERY] Starting fetch for upcoming UFC event...');

      // Get recent events
      const events = await apiService.getEvents({ page: 1, limit: 20 });
      console.log(`📅 [EVENT QUERY] Fetched ${events.events?.length || 0} events from API`);

      if (!events.events || events.events.length === 0) {
        console.log('❌ [EVENT QUERY] No events found');
        return null;
      }

      // Filter to UFC events only
      const ufcEvents = events.events.filter((event: any) => event.promotion === 'UFC');
      console.log(`🎯 [EVENT QUERY] Filtered to ${ufcEvents.length} UFC events`);

      // Find next upcoming event (including today)
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const upcomingEvents = ufcEvents
        .filter((event: any) => {
          const eventDate = new Date(event.date);
          return eventDate >= now && event.eventStatus !== 'COMPLETED';
        })
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

      console.log(`📅 [EVENT QUERY] Found ${upcomingEvents.length} upcoming UFC events`);

      if (upcomingEvents.length === 0) {
        console.log('❌ [EVENT QUERY] No upcoming events found');
        return null;
      }

      const nextEvent = upcomingEvents[0];
      console.log(`✅ [EVENT QUERY] Next event: ${nextEvent.name} (${nextEvent.date})`);

      // Fetch fights for this event
      const fights = await apiService.getFights({
        eventId: nextEvent.id,
        limit: 20,
        includeUserData: true
      });

      console.log(`🥊 [EVENT QUERY] Fetched ${fights.fights?.length || 0} fights`);

      return {
        event: nextEvent,
        fights: fights.fights || []
      };
    },
    staleTime: 30 * 1000, // 30 seconds for live updates
    retry: 1,
    retryDelay: 1000,
  });



  // Transform real fight data to expected format
  const transformFightData = (fights: any[]) => {
    return fights.map((fight, index) => ({
      id: fight.id,
      fighter1: `${fight.fighter1.firstName} ${fight.fighter1.lastName}${fight.fighter1.nickname ? ` "${fight.fighter1.nickname}"` : ''}`,
      fighter2: `${fight.fighter2.firstName} ${fight.fighter2.lastName}${fight.fighter2.nickname ? ` "${fight.fighter2.nickname}"` : ''}`,
      fighter1Id: fight.fighter1.id, // Store real fighter1 ID
      fighter2Id: fight.fighter2.id, // Store real fighter2 ID
      fighter1Object: fight.fighter1, // Store full fighter1 object
      fighter2Object: fight.fighter2, // Store full fighter2 object
      isMainEvent: fight.orderOnCard === 1,
      isMainCard: fight.cardType
        ? (!fight.cardType.toLowerCase().includes('prelim') && fight.cardType.toLowerCase() !== 'undercard')
        : fight.orderOnCard <= 5,
      cardPosition: fight.orderOnCard,
      weightClass: fight.isTitle ? fight.titleName : (fight.weightClass ? fight.weightClass.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()) : 'Unknown'),
      scheduledRounds: fight.scheduledRounds || (fight.isTitle ? 5 : 3),
      fightStatus: fight.fightStatus || 'UPCOMING',
      status: fight.fightStatus === 'COMPLETED' ? 'completed' : (fight.fightStatus === 'LIVE' ? 'in_progress' : 'upcoming'),
      isComplete: fight.fightStatus === 'COMPLETED',
      result: fight.winner ?
        (fight.method ?
          `${fight.winner === fight.fighter1.id ? fight.fighter1.firstName + ' ' + fight.fighter1.lastName : fight.fighter2.firstName + ' ' + fight.fighter2.lastName} via ${fight.method}${fight.round ? ` (R${fight.round})` : ''}` :
          `Winner: ${fight.winner === fight.fighter1.id ? fight.fighter1.firstName + ' ' + fight.fighter1.lastName : fight.fighter2.firstName + ' ' + fight.fighter2.lastName}`
        ) : null,
      aggregateRating: fight.averageRating || null,
      totalRatings: fight.totalRatings || 0,
      userRating: fight.userRating !== undefined && fight.userRating !== null ? fight.userRating : null,
      userHypePrediction: fight.userHypePrediction !== undefined && fight.userHypePrediction !== null ? fight.userHypePrediction : null,
      startTime: 'TBD'
    })).sort((a, b) => a.cardPosition - b.cardPosition); // Sort by card position
  };

  // Get fight card data (only use real data from API)
  const currentFightCard = fightCardData?.fights ? transformFightData(fightCardData.fights) : [];
  const currentEventName = eventLoading
    ? 'Loading event...'
    : (fightCardData?.event?.name || 'No upcoming events');

  // Generate consistent color for each user
  const getUserColor = (userId: string): string => {
    const colors = [
      '#FF6B6B', // Red
      '#4ECDC4', // Teal
      '#45B7D1', // Blue
      '#96CEB4', // Green
      '#DDA0DD', // Plum
      '#98D8C8', // Mint
      '#BB8FCE', // Purple
      '#85C1E9', // Light Blue
      '#F08080', // Light Coral
      '#82E0AA', // Light Green
      '#87CEEB', // Sky Blue
      '#DDA0DD', // Plum
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


  // Track if crew was deleted/not found to stop queries
  const [crewNotFound, setCrewNotFound] = useState(false);

  // Get crew details
  const {
    data: crewData,
    isLoading: crewLoading,
    error: crewError,
    refetch: refetchCrew,
  } = useQuery<{ crew: CrewDetails }>({
    queryKey: ['crew', id],
    queryFn: () => apiService.getCrew(id!),
    enabled: !!id && !crewNotFound,
    retry: false, // Don't retry if crew not found
    onError: (error: any) => {
      // If crew not found, stop all queries immediately
      if (error.status === 404 || error.code === 'CREW_NOT_FOUND') {
        setCrewNotFound(true);
      }
    },
  });

  // Handle crew not found error - navigate away
  useEffect(() => {
    if (crewNotFound) {
      // Cancel all queries for this crew
      queryClient.cancelQueries({ queryKey: ['crew', id] });
      queryClient.cancelQueries({ queryKey: ['crewMessages', id] });
      // Navigate back
      router.replace('/(tabs)');
    }
  }, [crewNotFound, id]);

  // Get crew messages
  const {
    data: messagesData,
    isLoading: messagesLoading,
    error: messagesError,
    refetch: refetchMessages,
  } = useQuery<{ messages: Message[] }>({
    queryKey: ['crewMessages', id],
    queryFn: () => apiService.getCrewMessages(id!),
    enabled: !!id && !crewNotFound,
    refetchInterval: crewNotFound ? false : 5000, // Stop polling if crew not found
    retry: false,
    onError: (error: any) => {
      // If crew not found, stop all queries
      if (error.status === 404 || error.code === 'CREW_NOT_FOUND') {
        setCrewNotFound(true);
      }
    },
  });

  // Clean up reactions for messages that no longer exist
  useEffect(() => {
    if (messagesData?.messages && Object.keys(localReactions).length > 0) {
      const currentMessageIds = new Set(messagesData.messages.map(m => m.id));
      const reactionMessageIds = Object.keys(localReactions);

      // Check if any stored reactions are for messages that no longer exist
      const orphanedReactions = reactionMessageIds.filter(id => !currentMessageIds.has(id));

      if (orphanedReactions.length > 0) {
        console.log('Cleaning up reactions for deleted messages:', orphanedReactions);
        setLocalReactions(prev => {
          const cleaned = { ...prev };
          orphanedReactions.forEach(id => delete cleaned[id]);
          return cleaned;
        });
      }
    }
  }, [messagesData?.messages, localReactions]);


  // Fetch actual fight data with user data for modals
  const {
    data: actualFightData,
    isLoading: fightLoading,
  } = useQuery<{ fight: any }>({
    queryKey: ['fight', currentFight?.id, 'withUserData'],
    queryFn: () => apiService.getFight(currentFight!.id),
    enabled: !!currentFight?.id && (showPredictionModal || showFightRatingModal),
    staleTime: 30 * 1000, // 30 seconds
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: (data: { content: string; fightId?: string }) => {
      return apiService.sendCrewMessage(id!, data);
    },
    onSuccess: (data) => {
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['crewMessages', id] });
      queryClient.invalidateQueries({ queryKey: ['crews'] });
    },
    onError: (error: any) => {
      showError(error.error || 'Failed to send message', 'Error');
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: (messageId: string) => {
      return apiService.deleteCrewMessage(id!, messageId);
    },
    onSuccess: () => {
      setSelectedMessageForDeletion(null);
      queryClient.invalidateQueries({ queryKey: ['crewMessages', id] });
    },
    onError: (error: any) => {
      showError(error.error || 'Failed to delete message', 'Error');
    },
  });


  const handleSendMessage = () => {
    if (!requireVerification('send a message')) return;
    if (message.trim() && !sendMessageMutation.isPending) {
      // Send message first
      sendMessageMutation.mutate({ content: message.trim() });
      // Then blur input with a small delay to prevent layout conflicts
      setTimeout(() => {
        textInputRef.current?.blur();
      }, 50);
    }
  };

  const handleSelectGif = (gifUrl: string) => {
    if (!requireVerification('send a message')) return;
    if (!sendMessageMutation.isPending) {
      // Send GIF URL as message content
      sendMessageMutation.mutate({ content: gifUrl });
    }
  };

  const handleShowInvite = () => {
    setShowInviteModal(true);
  };

  const handleCopyInviteCode = async () => {
    if (crew?.inviteCode) {
      await Clipboard.setStringAsync(crew.inviteCode);
      setShowInviteModal(false);
      setShowCodeCopiedToast(true);
      setTimeout(() => setShowCodeCopiedToast(false), 2000);
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

  const handleInviteFromContacts = () => {
    setShowInviteModal(false);
    router.push({
      pathname: '/crew/invite-contacts',
      params: {
        crewId: id as string,
        crewName: crew?.name || '',
        inviteCode: crew?.inviteCode || '',
      },
    });
  };

  // Function to simulate a fight ending and show rating modal
  const simulateFightEnd = () => {
    // Use the first upcoming fight from the current event
    const nextFight = currentFightCard.find(f => f.status === 'upcoming') || currentFightCard[0];
    if (!nextFight) {
      console.log('No fights available for simulation');
      return;
    }
    console.log('simulateFightEnd - Using fight:', nextFight.id);
    setCurrentFight(nextFight as any);
    setShowFightRatingModal(true);
  };

  // Function to simulate pre-fight and show prediction modal
  const simulatePreFight = () => {
    // Use the first upcoming fight from the current event
    const nextFight = currentFightCard.find(f => f.status === 'upcoming') || currentFightCard[0];
    if (!nextFight) {
      console.log('No fights available for simulation');
      return;
    }
    console.log('simulatePreFight - Using fight:', nextFight.id);
    setCurrentFight(nextFight as any);
    setShowPredictionModal(true);
  };

  // Function to simulate round ending and show round voting slideup
  const simulateRoundEnd = () => {
    const nextFight = currentFightCard.find(f => f.status === 'upcoming') || currentFightCard[0];
    if (!nextFight) {
      console.log('No fights available for simulation');
      return;
    }
    console.log('simulateRoundEnd - Round', currentRound, 'ended for fight:', nextFight.id);
    setCurrentFight(nextFight as any);
    setShowRoundVoting(true);
  };


  const closeFightRatingModal = () => {
    setShowFightRatingModal(false);
    setCurrentFight(null);
  };

  const closePredictionModal = () => {
    setShowPredictionModal(false);
    setCurrentFight(null);
  };

  const closeRoundVoting = () => {
    setShowRoundVoting(false);
    setCurrentFight(null);
  };

  const handleEventBannerLoad = (e: any) => {
    const { width, height } = e.nativeEvent.source;
    if (width && height) {
      setEventBannerAspectRatio(width / height);
    }
  };

  const handleRoundWinnerSelected = (fighterId: string, fighterName: string) => {
    console.log(`Round ${currentRound} winner selected:`, fighterName, `(ID: ${fighterId})`);

    // Send message to crew chat about round winner selection
    const message = `Round ${currentRound}: ${fighterName} 🥊`;
    sendMessageMutation.mutate({
      content: message,
      fightId: currentFight?.id
    });

    // Move to next round for next round voting
    setCurrentRound(prev => prev + 1);

    // Close the slideup
    closeRoundVoting();
  };

  // Handle long press on message to show reaction menu
  const handleMessageLongPress = (messageId: string, event: any, isCurrentUser: boolean) => {
    // If it's the current user's message, show delete option
    if (isCurrentUser) {
      setSelectedMessageForDeletion(messageId);
      return;
    }

    // Otherwise show reaction menu
    const { pageX, pageY } = event.nativeEvent;
    const screenWidth = Dimensions.get('window').width;
    const screenHeight = Dimensions.get('window').height;

    // Conservative menu dimensions (being safe with larger estimates)
    const menuWidth = 320; // Conservative estimate for 6 emoji buttons + padding
    const menuHeight = 60; // Conservative estimate for height + shadow
    const menuPadding = 15; // Larger minimum distance from screen edges

    console.log('Long press at:', { pageX, pageY, screenWidth, screenHeight });

    // Calculate optimal position to keep menu fully visible
    let optimalX = pageX - (menuWidth / 2); // Center menu on touch point
    let optimalY = pageY - menuHeight - 15; // Position above touch point with more space

    // Adjust X position if menu would go off-screen
    if (optimalX < menuPadding) {
      optimalX = menuPadding; // Too far left
      console.log('Adjusted X for left edge:', optimalX);
    } else if (optimalX + menuWidth > screenWidth - menuPadding) {
      optimalX = screenWidth - menuWidth - menuPadding; // Too far right
      console.log('Adjusted X for right edge:', optimalX);
    }

    // Adjust Y position if menu would go off-screen
    if (optimalY < 60) {
      optimalY = pageY + 15; // Position below touch point instead
      console.log('Adjusted Y to below touch point:', optimalY);
    }
    if (optimalY + menuHeight > screenHeight - 120) {
      optimalY = screenHeight - menuHeight - 120; // Ensure it's above keyboard/input area
      console.log('Adjusted Y for bottom edge:', optimalY);
    }

    console.log('Final position:', { optimalX, optimalY });

    setSelectedMessageId(messageId);
    setReactionMenuPosition({ x: optimalX, y: optimalY });
    setShowReactionMenu(true);
  };

  // Handle emoji reaction selection
  const handleEmojiReaction = (emoji: string) => {
    if (selectedMessageId && user) {
      console.log(`Adding reaction ${emoji} to message ${selectedMessageId}`);
      console.log('Current user object:', user);

      // Update local reactions state (persistent across query refetches)
      setLocalReactions(prev => {
        const messageReactions = prev[selectedMessageId] || [];

        // Check if user already reacted with this exact emoji
        const userCurrentReaction = messageReactions.find(r =>
          r.emoji === emoji && r.users.some(u => u.id === user.id)
        );

        // Remove user from ALL existing reactions (enforce one emoji per user)
        let updatedReactions = messageReactions.map(reaction => ({
          ...reaction,
          users: reaction.users.filter(u => u.id !== user.id),
          count: reaction.users.filter(u => u.id !== user.id).length
        })).filter(reaction => reaction.count > 0); // Remove reactions with no users

        // If user clicked the same emoji they already had, just remove it (toggle off)
        if (userCurrentReaction) {
          console.log(`User toggled off reaction ${emoji}`);
          return {
            ...prev,
            [selectedMessageId]: updatedReactions
          };
        }

        // Get user display name from available properties
        const getUserDisplayName = (userObj: any) => {
          return userObj.name || userObj.username || userObj.firstName ||
                 (userObj.firstName && userObj.lastName ? `${userObj.firstName} ${userObj.lastName}` : null) ||
                 userObj.email?.split('@')[0] || 'Unknown User';
        };

        // User clicked a different emoji - add their reaction to this emoji
        const targetEmojiReaction = updatedReactions.find(r => r.emoji === emoji);
        if (targetEmojiReaction) {
          // Emoji already exists from other users, add current user to it
          targetEmojiReaction.users.push({
            id: user.id,
            name: getUserDisplayName(user)
          });
          targetEmojiReaction.count = targetEmojiReaction.users.length;
        } else {
          // New emoji, create new reaction
          updatedReactions.push({
            emoji,
            users: [{
              id: user.id,
              name: getUserDisplayName(user)
            }],
            count: 1
          });
        }

        console.log(`User reacted with ${emoji}, total reactions:`, updatedReactions.length);
        return {
          ...prev,
          [selectedMessageId]: updatedReactions
        };
      });

      setShowReactionMenu(false);
      setSelectedMessageId(null);
    }
  };

  // Close reaction menu
  const closeReactionMenu = () => {
    setShowReactionMenu(false);
    setSelectedMessageId(null);
  };

  // Handle tapping on reaction emoji to show users
  const handleReactionTap = (messageReactions: any[], messageId: string) => {
    console.log('Reaction tap - raw data:', messageReactions);
    setSelectedReactionData(messageReactions);
    setSelectedMessageId(messageId); // Store messageId for deletion
    setShowReactionUsers(true);
  };

  // Close reaction users slideup
  const closeReactionUsers = () => {
    setShowReactionUsers(false);
    setSelectedReactionData([]);
  };

  // Handle deleting user's reaction from slideup
  const handleDeleteReaction = (emoji: string, messageId: string) => {
    if (user) {
      console.log(`Deleting reaction ${emoji} from message ${messageId}`);

      // Remove user's reaction from local state
      setLocalReactions(prev => {
        const messageReactions = prev[messageId] || [];

        // Remove user from all reactions and filter out empty reactions
        const updatedReactions = messageReactions.map(reaction => ({
          ...reaction,
          users: reaction.users.filter(u => u.id !== user.id),
          count: reaction.users.filter(u => u.id !== user.id).length
        })).filter(reaction => reaction.count > 0);

        return {
          ...prev,
          [messageId]: updatedReactions
        };
      });

      // Close the slideup after deletion
      closeReactionUsers();
    }
  };

  // Handle tapping status bar to toggle fight card with slide animation
  const handleStatusBarTap = () => {
    console.log('Status bar tapped, fight card data:', currentFightCard.length, 'fights');
    const newValue = !showFightCard;
    console.log('Setting showFightCard to:', newValue);

    if (newValue) {
      setShowFightCard(true);
      Animated.timing(fightCardSlideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      setShowFightCard(false);
      Animated.timing(fightCardSlideAnim, {
        toValue: -1000,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  };

  // Close fight card slidedown
  const closeFightCard = () => {
    setShowFightCard(false);
  };

  // Helper function to parse fighter name from display string
  const parseFighterName = (displayName: string) => {
    // Handle format: FirstName LastName "Nickname" or FirstName LastName
    const nicknameMatch = displayName.match(/^(.+)\s+"([^"]+)"$/);

    if (nicknameMatch) {
      // Format: FirstName LastName "Nickname"
      const nameWithoutNickname = nicknameMatch[1].trim();
      const parts = nameWithoutNickname.split(' ');
      return {
        firstName: parts[0],
        lastName: parts.slice(1).join(' '),
        nickname: nicknameMatch[2]
      };
    } else {
      // Format: FirstName LastName (no nickname)
      const parts = displayName.split(' ');
      return {
        firstName: parts[0],
        lastName: parts.slice(1).join(' '),
        nickname: undefined
      };
    }
  };

  // Handle tapping a fight item to open appropriate modal based on status
  const handleFightItemTap = (fightData: any) => {
    // Create a Fight object from the fight card data for the modal with REAL fighter IDs
    const fightForModal: Fight = {
      id: fightData.id,
      scheduledRounds: fightData.scheduledRounds,
      fighter1: fightData.fighter1Object || {
        id: fightData.fighter1Id || (fightData.id + '-fighter1'), // Use real ID, fallback to mock
        firstName: parseFighterName(fightData.fighter1).firstName,
        lastName: parseFighterName(fightData.fighter1).lastName,
        nickname: parseFighterName(fightData.fighter1).nickname
      },
      fighter2: fightData.fighter2Object || {
        id: fightData.fighter2Id || (fightData.id + '-fighter2'), // Use real ID, fallback to mock
        firstName: parseFighterName(fightData.fighter2).firstName,
        lastName: parseFighterName(fightData.fighter2).lastName,
        nickname: parseFighterName(fightData.fighter2).nickname
      },
      event: fightCardData?.event || {
        id: 'unknown',
        name: currentEventName,
        date: new Date().toISOString(),
        promotion: 'UFC'
      }
    };

    setCurrentFight(fightForModal);

    // Open prediction modal for upcoming fights, rating modal for completed/in-progress fights
    if (fightData.status === 'upcoming') {
      setShowPredictionModal(true);
    } else {
      setShowFightRatingModal(true);
    }
  };

  const handleMute = async (duration: '8hours' | 'forever') => {
    try {
      const result = await apiService.muteCrewChat(id, duration);
      showSuccess(result.message, 'Muted');
      refetchCrew();
    } catch (error: any) {
      showError(error.error || 'Failed to mute chat', 'Error');
    }
  };

  const handleUnmute = async () => {
    try {
      const result = await apiService.unmuteCrewChat(id);
      showSuccess(result.message, 'Unmuted');
      refetchCrew();
    } catch (error: any) {
      showError(error.error || 'Failed to unmute chat', 'Error');
    }
  };


  const renderMessage = ({ item }: { item: Message }) => {
    const userColor = getUserColor(item.user.id);
    const isCurrentUser = item.user.id === user?.id;

    // Merge server reactions with local reactions
    const serverReactions = item.reactions || [];
    const localMessageReactions = localReactions[item.id] || [];
    const allReactions = localMessageReactions.length > 0 ? localMessageReactions : serverReactions;

    return (
      <View
        style={[
          styles.messageWrapper,
          isCurrentUser ? styles.currentUserWrapper : styles.otherUserWrapper,
        ]}
      >
        <TouchableOpacity
          onLongPress={(event) => handleMessageLongPress(item.id, event, isCurrentUser)}
          delayLongPress={500}
          activeOpacity={0.8}
        >
          <View style={[
            styles.messageContainer,
            isCurrentUser ? [
              styles.currentUserMessage,
              {
                backgroundColor: selectedMessageForDeletion === item.id ? colors.danger + '20' : colors.card,
                borderRightColor: colors.primary
              }
            ] : [
              styles.otherUserMessage,
              { borderLeftColor: userColor, backgroundColor: colors.card }
            ]
          ]}>
            {!isCurrentUser && (
              <Text style={[
                styles.userName,
                {
                  color: userColor,
                  marginBottom: 4
                }
              ]}>
                {item.user.name}
              </Text>
            )}
            {/* Check if message is deleted */}
            {item.messageType === 'DELETED' ? (
              <Text style={[
                styles.messageContent,
                {
                  color: colors.textSecondary,
                  fontStyle: 'italic'
                }
              ]}>
                {item.content}
              </Text>
            ) : /* Check if content is a GIF URL */
            item.content.match(/^https?:\/\/.*\.gif$/i) || item.content.includes('giphy.com') || item.content.includes('media.tenor.com') ? (
              <Image
                source={{ uri: item.content }}
                style={styles.gifMessage}
                resizeMode="cover"
              />
            ) : (
              <Text style={[
                styles.messageContent,
                {
                  color: isCurrentUser ? 'white' : colors.text
                }
              ]}>
                {item.content}
              </Text>
            )}
            {item.fight && (
              <View style={[
                styles.fightReference,
                {
                  backgroundColor: isCurrentUser ? 'rgba(255, 255, 255, 0.15)' : colors.background
                }
              ]}>
                <FontAwesome
                  name="star"
                  size={14}
                  color={isCurrentUser ? 'white' : colors.tint}
                />
                <Text style={[
                  styles.fightText,
                  {
                    color: isCurrentUser ? 'rgba(255, 255, 255, 0.9)' : colors.textSecondary
                  }
                ]}>
                  {item.fight.matchup}
                </Text>
              </View>
            )}

            <View style={styles.messageFooter}>
              <Text style={[
                styles.timestamp,
                {
                  color: isCurrentUser ? 'rgba(255, 255, 255, 0.8)' : colors.textSecondary
                }
              ]}>
                {new Date(item.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Reactions Display - Outside message container */}
        {allReactions && allReactions.length > 0 && (
          <TouchableOpacity
            style={[
              styles.reactionsContainer,
              isCurrentUser ? styles.reactionsContainerRight : styles.reactionsContainerLeft
            ]}
            onPress={() => handleReactionTap(allReactions, item.id)}
            activeOpacity={0.7}
          >
            {allReactions.map((reaction, index) => (
              <Text key={index} style={styles.reactionEmojiClean}>
                {reaction.emoji}
              </Text>
            ))}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={[styles.emptyContainer, { transform: [{ rotate: '180deg' }] }]}>
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
  // Reverse messages for inverted FlatList - newest messages should be at index 0
  const reversedMessages = [...messages].reverse();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        {crew.imageUrl ? (
          <Image
            source={{ uri: crew.imageUrl }}
            style={styles.headerCrewImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.headerCrewIcon, { backgroundColor: colors.tint }]}>
            <FontAwesome name="users" size={18} color={colors.textOnAccent} />
          </View>
        )}
        <View style={styles.headerInfo}>
          <Text style={[styles.crewName, { color: colors.text }]} numberOfLines={1}>
            {crew.name}
          </Text>
          <Text style={[styles.memberCount, { color: colors.textSecondary }]}>
            {crew.totalMembers} member{crew.totalMembers !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={styles.headerActions}>
          {selectedMessageForDeletion ? (
            <TouchableOpacity
              onPress={() => {
                const messageIdToDelete = selectedMessageForDeletion;
                setSelectedMessageForDeletion(null);
                if (messageIdToDelete) {
                  deleteMessageMutation.mutate(messageIdToDelete);
                }
              }}
              style={{
                padding: 12,
                margin: -12,
                marginRight: -5,
              }}
            >
              <FontAwesome name="trash" size={20} color={colors.danger} />
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity onPress={simulatePreFight} style={styles.testButton}>
                <FontAwesome name="trophy" size={16} color={colors.tint} />
              </TouchableOpacity>
              <TouchableOpacity onPress={simulateRoundEnd} style={styles.testButton}>
                <FontAwesome name="clock-o" size={16} color={colors.tint} />
              </TouchableOpacity>
              <TouchableOpacity onPress={simulateFightEnd} style={styles.testButton}>
                <FontAwesome name="star" size={16} color={colors.tint} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowCrewMenu(true)}
                style={{ padding: 8, margin: -8, marginRight: 8 }}
              >
                <FontAwesome name="ellipsis-v" size={20} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleShowInvite}>
                <FontAwesome name="share" size={20} color={colors.text} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Content Area - Contains both status bar and messages */}
      <View style={styles.contentArea}>
        {/* Event/Fight Status Bar - Always visible */}
        <View style={[
          styles.statusBarContainer,
          {
            backgroundColor: colors.background,
            borderBottomColor: showFightCard ? 'transparent' : colors.border,
            overflow: 'hidden',
          }
        ]}>
          <TouchableOpacity
            style={[styles.statusBar, showFightCard && { height: 120 }]}
            onPress={() => {
              if (selectedMessageForDeletion) {
                setSelectedMessageForDeletion(null);
              } else {
                handleStatusBarTap();
              }
            }}
            activeOpacity={0.8}
          >
            <View style={styles.statusSection}>
              <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>Event</Text>
              <Text style={[
                styles.statusValue,
                {
                  color: colors.text,
                  textAlign: 'center'
                }
              ]} numberOfLines={showFightCard ? undefined : 2}>
                {currentEventName}
              </Text>
            </View>
            <View style={[styles.statusDivider, { left: '33.33%', marginLeft: 16 }]} />
            <View style={styles.statusSection}>
              <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>Current Fight</Text>
              <Text style={[
                styles.statusValue,
                {
                  color: colors.text,
                  textAlign: 'center'
                }
              ]} numberOfLines={showFightCard ? undefined : 2}>
                {(() => {
                  // Find the current fight (in progress) or next upcoming fight
                  const inProgressFight = currentFightCard.find(f => f.status === 'in_progress');
                  const nextFight = inProgressFight || currentFightCard.find(f => f.status === 'upcoming');
                  const currentFightName = nextFight ?
                    `${nextFight.fighter1.split(' ')[0]} vs ${nextFight.fighter2.split(' ')[0]}` :
                    'Holloway vs Volkanovski';
                  return currentFightName + getStatusPaddingLines(currentFightName);
                })()}
              </Text>
            </View>
            <View style={[styles.statusDivider, { left: '66.66%', marginLeft: 16 }]} />
            <View style={styles.statusSection}>
              <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>Round</Text>
              <Text style={[
                styles.statusValue,
                {
                  color: colors.tint,
                  textAlign: 'center'
                }
              ]} numberOfLines={showFightCard ? undefined : 2}>
                {(() => {
                  const inProgressFight = currentFightCard.find(f => f.status === 'in_progress');
                  if (inProgressFight) {
                    // Between rounds 2 and 3
                    return `End R2\n${inProgressFight.scheduledRounds} Rds${showFightCard ? '\n ' : ''}`;
                  }
                  return `3 / 5${showFightCard ? '\n\n ' : ''}`;
                })()}
              </Text>
            </View>
            <FontAwesome
              name={showFightCard ? "chevron-up" : "chevron-down"}
              size={16}
              color={colors.textSecondary}
              style={styles.statusChevron}
            />
          </TouchableOpacity>
        </View>

        {/* Dynamic Content Area - Fight Card OR Messages */}
        {showFightCard ? (
          /* Expanded Fight Card Content with Slide Animation */
          <Animated.View
            style={[
              styles.expandedFightCard,
              {
                transform: [{ translateY: fightCardSlideAnim }]
              }
            ]}
          >
            <View style={styles.fightCardExpandedContent}>
              <ScrollView
                style={styles.expandedFightsScrollView}
                contentContainerStyle={{
                  paddingBottom: keyboardHeight > 0 ? keyboardHeight + 120 : 90, // Extra padding for message input area
                }}
                showsVerticalScrollIndicator={true}
                bounces={true}
              >
                {/* Event Banner Image */}
                <View style={{ marginHorizontal: 20, marginBottom: 8, marginTop: 16 }}>
                  {(fightCardData?.event?.bannerImage || getDefaultBanner(fightCardData?.event?.promotion || '')) ? (
                    <Image
                      source={
                        fightCardData?.event?.bannerImage
                          ? { uri: fightCardData.event.bannerImage }
                          : getDefaultBanner(fightCardData?.event?.promotion || '')
                      }
                      style={[styles.eventBannerImage, { aspectRatio: eventBannerAspectRatio }]}
                      resizeMode="contain"
                      onLoad={handleEventBannerLoad}
                    />
                  ) : (
                    <View style={[styles.eventBannerImage, { aspectRatio: 16 / 9, backgroundColor: '#1a1a2e', justifyContent: 'center', alignItems: 'center', borderRadius: 12 }]}>
                      <PromotionLogo promotion={fightCardData?.event?.promotion || ''} size={72} />
                    </View>
                  )}
                </View>

                <View style={{ paddingHorizontal: 16 }}>
                  {currentFightCard.length > 0 ? (
                  currentFightCard.map((fight, index) => {
                    // Check if this is the first prelim fight (after all main card fights)
                    const isFirstPrelimFight = !fight.isMainCard &&
                      (index === 0 || currentFightCard[index - 1].isMainCard);

                    // Check if this is the main event fight
                    const isMainEvent = fight.isMainEvent;

                    return (
                      <View key={fight.id}>
                        {/* Show "Main Card" divider before main event fight */}
                        {isMainEvent && (
                          <View style={styles.sectionDivider}>
                            <Text style={[styles.sectionDividerText, { color: colors.textSecondary }]}>
                              Main Card
                            </Text>
                          </View>
                        )}
                        {/* Show "Prelims" divider before first prelim fight */}
                        {isFirstPrelimFight && (
                          <View style={styles.sectionDivider}>
                            <Text style={[styles.sectionDividerText, { color: colors.textSecondary }]}>
                              Prelims
                            </Text>
                          </View>
                        )}
                        <View style={{ marginBottom: 16 }}>
                          <FightDisplayCardMinimal
                            fightData={fight}
                            onPress={handleFightItemTap}
                          />
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <Text style={[{ color: colors.text, padding: 20, textAlign: 'center' }]}>
                    No fights available
                  </Text>
                )}
                </View>
              </ScrollView>
            </View>
          </Animated.View>
        ) : (
          /* Messages Container */
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {
              if (selectedMessageForDeletion) {
                setSelectedMessageForDeletion(null);
              }
            }}
            style={[styles.chatContainer, {
              paddingBottom: keyboardHeight > 0 ? keyboardHeight + 93 : 70
            }]}
          >
            <FlatList
              ref={flatListRef}
              data={reversedMessages}
              renderItem={renderMessage}
              keyExtractor={(item) => item.id}
              contentContainerStyle={messages.length === 0 ? styles.emptyListContainer : styles.messagesContainer}
              ListEmptyComponent={renderEmptyState}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              inverted
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Round Voting Slideup - positioned above message input */}
      {showRoundVoting && currentFight && (
        <RoundVotingSlideup
          visible={showRoundVoting}
          fighter1={{
            id: currentFight.fighter1.id,
            firstName: currentFight.fighter1.firstName,
            lastName: currentFight.fighter1.lastName,
            nickname: currentFight.fighter1.nickname,
          }}
          fighter2={{
            id: currentFight.fighter2.id,
            firstName: currentFight.fighter2.firstName,
            lastName: currentFight.fighter2.lastName,
            nickname: currentFight.fighter2.nickname,
          }}
          currentRound={currentRound}
          onSelectWinner={handleRoundWinnerSelected}
          onClose={closeRoundVoting}
        />
      )}

      {/* Message Input - Fixed at bottom */}
      <View style={[styles.inputContainer, {
        backgroundColor: colors.card,
        borderTopColor: colors.border,
        position: 'absolute',
        bottom: keyboardHeight > 0 ? keyboardHeight + 23 : (Platform.OS === 'ios' ? 34 : 0),
        left: 0,
        right: 0,
      }]}>
        <TouchableOpacity
          style={styles.gifButton}
          onPress={() => setShowGifPicker(true)}
        >
          <FontAwesome
            name="file-image-o"
            size={20}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
        <TextInput
          ref={textInputRef}
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
          blurOnSubmit={true}
          onSubmitEditing={handleSendMessage}
          returnKeyType="send"
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
        statusBarTranslucent={true}
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
              style={[styles.inviteFromContactsButton, { backgroundColor: colors.success }]}
              onPress={handleInviteFromContacts}
            >
              <FontAwesome name="users" size={16} color="white" />
              <Text style={styles.inviteFromContactsButtonText}>Invite from Contacts</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.closeModalButton, { borderColor: colors.border }]}
              onPress={() => setShowInviteModal(false)}
            >
              <Text style={[styles.closeModalButtonText, { color: colors.text }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>


      {/* Emoji Reaction Menu */}
      {showReactionMenu && (
        <Modal
          visible={showReactionMenu}
          transparent={true}
          animationType="fade"
          onRequestClose={closeReactionMenu}
        >
          <TouchableOpacity
            style={styles.reactionModalOverlay}
            activeOpacity={1}
            onPress={closeReactionMenu}
          >
            <View
              style={[
                styles.reactionMenu,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  top: reactionMenuPosition.y,
                  left: reactionMenuPosition.x,
                }
              ]}
            >
              {['👍', '❤️', '😂', '😮', '😢', '🔥'].map((emoji, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.emojiButton}
                  onPress={() => handleEmojiReaction(emoji)}
                >
                  <Text style={styles.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Reaction Users Slideup */}
      {showReactionUsers && (
        <Modal
          visible={showReactionUsers}
          transparent={true}
          animationType="slide"
          onRequestClose={closeReactionUsers}
        >
          <TouchableOpacity
            style={styles.reactionUsersOverlay}
            activeOpacity={1}
            onPress={closeReactionUsers}
          >
            <View style={[styles.reactionUsersContainer, { backgroundColor: colors.card }]}>
              <View style={[styles.reactionUsersHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.reactionUsersTitle, { color: colors.text }]}>
                  Reactions
                </Text>
                <TouchableOpacity onPress={closeReactionUsers}>
                  <FontAwesome name="times" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.reactionUsersList}>
                {selectedReactionData.map((reaction, index) => {
                  console.log(`Rendering reaction ${index}:`, reaction);
                  console.log(`Users for ${reaction.emoji}:`, reaction.users);
                  return (
                    <View key={index} style={styles.reactionUsersItem}>
                      <Text style={styles.reactionUsersEmoji}>{reaction.emoji}</Text>
                      <View style={styles.reactionUsersNames}>
                        {reaction.users && reaction.users.length > 0 ? (
                          reaction.users.map((reactionUser, userIndex) => {
                            console.log(`Rendering user ${userIndex}:`, reactionUser);
                            const isCurrentUser = reactionUser.id === user?.id;
                            return (
                              <View key={userIndex} style={styles.reactionUserRow}>
                                <Text style={[styles.reactionUserName, { color: colors.text }]}>
                                  {reactionUser.name || reactionUser.id || 'Unknown User'}
                                </Text>
                                {isCurrentUser && (
                                  <TouchableOpacity
                                    onPress={() => handleDeleteReaction(reaction.emoji, selectedMessageId!)}
                                    style={styles.deleteReactionButton}
                                  >
                                    <Text style={[styles.deleteReactionText, { color: colors.textSecondary }]}>
                                      tap to delete
                                    </Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            );
                          })
                        ) : (
                          <Text style={[styles.reactionUserName, { color: colors.textSecondary }]}>
                            No users found
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Mute Chat Dialog */}
      <Modal
        visible={showMuteDialog}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowMuteDialog(false)}
      >
        <TouchableOpacity
          style={styles.muteDialogOverlay}
          activeOpacity={1}
          onPress={() => setShowMuteDialog(false)}
        >
          <TouchableOpacity
            style={[styles.muteDialogContainer, { backgroundColor: colors.card }]}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.muteDialogTitle, { color: colors.text }]}>Mute Chat</Text>
            <Text style={[styles.muteDialogMessage, { color: colors.textSecondary }]}>
              How long would you like to mute this chat?
            </Text>

            <View style={styles.muteDialogButtons}>
              <TouchableOpacity
                style={[styles.muteDialogButton, { borderTopColor: colors.border }]}
                onPress={() => {
                  setShowMuteDialog(false);
                  handleMute('8hours');
                }}
              >
                <Text style={[styles.muteDialogButtonText, { color: colors.tint }]}>
                  Mute for 8 hours
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.muteDialogButton, { borderTopColor: colors.border }]}
                onPress={() => {
                  setShowMuteDialog(false);
                  handleMute('forever');
                }}
              >
                <Text style={[styles.muteDialogButtonText, { color: colors.tint }]}>
                  Mute Forever
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.muteDialogButton, { borderTopColor: colors.border }]}
                onPress={() => setShowMuteDialog(false)}
              >
                <Text style={[styles.muteDialogButtonText, { color: colors.textSecondary, fontWeight: '600' }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Crew Menu Modal */}
      <Modal
        visible={showCrewMenu}
        transparent={true}
        animationType="fade"
        statusBarTranslucent={true}
        onRequestClose={() => setShowCrewMenu(false)}
      >
        <TouchableOpacity
          style={styles.crewMenuOverlay}
          activeOpacity={1}
          onPress={() => setShowCrewMenu(false)}
        >
          <View style={[styles.crewMenuContainer, { backgroundColor: colors.card }]}>
            <TouchableOpacity
              style={[styles.crewMenuItem, { borderBottomColor: colors.border }]}
              onPress={() => {
                setShowCrewMenu(false);
                router.push(`/crew/info/${id}`);
              }}
            >
              <FontAwesome name="info-circle" size={20} color={colors.text} />
              <Text style={[styles.crewMenuItemText, { color: colors.text }]}>Crew Info</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.crewMenuItem, { borderBottomColor: colors.border }]}
              onPress={() => {
                setShowCrewMenu(false);
                if (crew.isMuted) {
                  // Unmute directly
                  handleUnmute();
                } else {
                  setShowMuteDialog(true);
                }
              }}
            >
              <FontAwesome name={crew.isMuted ? "bell" : "bell-slash"} size={20} color={colors.text} />
              <Text style={[styles.crewMenuItemText, { color: colors.text }]}>
                {crew.isMuted ? 'Unmute Chat' : 'Mute Chat'}
              </Text>
            </TouchableOpacity>

            {crew.userRole !== 'OWNER' && (
              <TouchableOpacity
                style={styles.crewMenuItem}
                onPress={() => {
                  setShowCrewMenu(false);
                  showError('Coming soon...', 'Leave Crew');
                }}
              >
                <FontAwesome name="sign-out" size={20} color={colors.danger} />
                <Text style={[styles.crewMenuItemText, { color: colors.danger }]}>Leave Crew</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* GIF Picker Modal */}
      <GifPickerModal
        visible={showGifPicker}
        onClose={() => setShowGifPicker(false)}
        onSelectGif={handleSelectGif}
        colorScheme={colorScheme || 'dark'}
      />

      {/* Code Copied Toast */}
      {showCodeCopiedToast && (
        <View style={styles.toastContainer}>
          <View style={[styles.toast, { backgroundColor: colors.card }]}>
            <FontAwesome name="check-circle" size={20} color="#10b981" />
            <Text style={[styles.toastText, { color: colors.text }]}>Code Copied!</Text>
          </View>
        </View>
      )}

      <CustomAlert {...alertState} onDismiss={hideAlert} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentArea: {
    flex: 1,
    overflow: 'hidden',
  },
  flex1: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
    paddingTop: Platform.OS === 'ios' ? 60 : 40, // Safe spacing below status bar
  },
  headerInfo: {
    flex: 1,
  },
  headerCrewImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  headerCrewIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
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
  messageWrapper: {
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  currentUserWrapper: {
    alignItems: 'flex-end',
  },
  otherUserWrapper: {
    alignItems: 'flex-start',
  },
  messageContainer: {
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  currentUserMessage: {
    borderTopRightRadius: 4,
    borderRightWidth: 3,
    marginRight: 4,
    alignSelf: 'stretch',
  },
  otherUserMessage: {
    borderTopLeftRadius: 4,
    borderLeftWidth: 3,
    marginLeft: 4,
    alignSelf: 'stretch',
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  messageFooter: {
    alignItems: 'flex-end',
    marginTop: 4,
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
  gifMessage: {
    width: 200,
    height: 200,
    borderRadius: 8,
    marginTop: 4,
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
  gifButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
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
    padding: 12,
    marginLeft: -8,
    marginRight: 4,
  },
  backButtonOriginal: {
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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
  inviteFromContactsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
    marginBottom: 16,
  },
  inviteFromContactsButtonText: {
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
  // Status Bar Styles
  statusBarContainer: {
    borderBottomWidth: 1,
    zIndex: 10,
    position: 'relative',
  },
  statusBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: -1,
    paddingBottom: 25,
    alignItems: 'flex-start',
    height: 85,
  },
  statusBarExpanded: {
    minHeight: 80,
    alignItems: 'center',
    paddingVertical: 16,
  },
  statusSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 8,
    minHeight: 50,
  },
  statusSectionExpanded: {
    justifyContent: 'center',
  },
  statusDivider: {
    position: 'absolute',
    width: 1,
    height: 30,
    backgroundColor: '#666',
    top: 35,
    transform: [{ translateX: -0.5 }],
  },
  statusLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusChevron: {
    position: 'absolute',
    right: 18,
    top: 33,
  },
  // Reaction Styles
  reactionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: -8, // Negative margin to overlap message border
    gap: 4,
    paddingHorizontal: 4,
  },
  reactionsContainerLeft: {
    alignSelf: 'flex-start',
    marginLeft: 8, // Align with left side of message bubble
  },
  reactionsContainerRight: {
    alignSelf: 'flex-end',
    marginRight: 8, // Align with right side of message bubble
  },
  reactionBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    gap: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionEmojiClean: {
    fontSize: 18,
    marginHorizontal: 2,
  },
  reactionCount: {
    fontSize: 12,
    fontWeight: '500',
  },
  // Reaction Menu Styles
  reactionModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  reactionMenu: {
    position: 'absolute',
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 25,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  emojiButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 20,
  },
  emojiText: {
    fontSize: 28,
  },
  // Reaction Users Slideup Styles
  reactionUsersOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  reactionUsersContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '50%',
  },
  reactionUsersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    marginBottom: 16,
  },
  reactionUsersTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  reactionUsersList: {
    gap: 12,
  },
  reactionUsersItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reactionUsersEmoji: {
    fontSize: 24,
    width: 30,
  },
  reactionUsersNames: {
    flex: 1,
    gap: 4,
  },
  reactionUserName: {
    fontSize: 16,
    fontWeight: '500',
  },
  reactionUserRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  deleteReactionButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  deleteReactionText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  // Expanded Status Bar Styles
  expandedFightCard: {
    paddingTop: 16,
    paddingBottom: 16,
    flex: 1, // Fill available space
    zIndex: 1,
    position: 'relative',
  },
  fightCardExpandedContent: {
    flex: 1,
  },
  eventBannerImage: {
    width: '100%',
    height: undefined,
    borderRadius: 8,
    alignSelf: 'stretch',
  },
  fightCardExpandedSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 16,
    textAlign: 'center',
  },
  expandedFightsScrollView: {
    flex: 1, // Fill remaining space
  },
  sectionDivider: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  sectionDividerText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  fightCardOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  fightMainEvent: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
    letterSpacing: 1,
  },
  fightMatchup: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  fightDetails: {
    fontSize: 14,
  },
  crewMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: Platform.OS === 'ios' ? 100 : 80,
    paddingRight: 16,
  },
  crewMenuContainer: {
    borderRadius: 8,
    minWidth: 200,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  crewMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
  },
  crewMenuItemText: {
    fontSize: 16,
    fontWeight: '500',
  },
  muteDialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  muteDialogContainer: {
    borderRadius: 12,
    width: '100%',
    maxWidth: 320,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  muteDialogTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  muteDialogMessage: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    paddingBottom: 20,
  },
  muteDialogButtons: {
    borderTopWidth: 0,
  },
  muteDialogButton: {
    paddingVertical: 16,
    alignItems: 'center',
    borderTopWidth: 1,
  },
  muteDialogButtonText: {
    fontSize: 16,
  },
  toastContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 100 : 80,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  toastText: {
    fontSize: 16,
    fontWeight: '600',
  },
});