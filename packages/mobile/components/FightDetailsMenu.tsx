import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, useColorScheme, Switch, ActivityIndicator, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { getFighterDisplayName } from '../utils/formatFighterName';

interface Fighter {
  id: string;
  firstName: string;
  lastName: string;
}

interface Event {
  id: string;
  name: string;
  date: string;
  hasLiveTracking?: boolean;
}

interface NotificationReasons {
  willBeNotified: boolean;
  reasons: Array<{
    type: 'manual' | 'fighter' | 'rule';
    source: string;
    ruleId?: string;
    isActive: boolean;
  }>;
}

interface Fight {
  fighter1: Fighter;
  fighter2: Fighter;
  fighter1Id: string;
  fighter2Id: string;
  event: Event;
  weightClass?: string | null;
  isTitle?: boolean;
  isFollowingFighter1?: boolean;
  isFollowingFighter2?: boolean;
  notificationReasons?: NotificationReasons;
}

interface FightDetailsMenuProps {
  fight: Fight;
  visible: boolean;
  onClose: () => void;
  // Optional props for notification toggle (only for upcoming fights)
  isFollowing?: boolean;
  onToggleNotification?: (enabled: boolean) => void;
  isTogglingNotification?: boolean;
  onToggleFighterNotification?: (fighterId: string, enabled: boolean) => void;
  isTogglingFighterNotification?: boolean;
  // Toast props
  toastMessage?: string;
  toastOpacity?: Animated.Value;
  toastTranslateY?: Animated.Value;
}

// Format event date for display
const formatEventDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// Format weight class for display
const formatWeightClass = (weightClass: string) => {
  return weightClass
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

export default function FightDetailsMenu({
  fight,
  visible,
  onClose,
  isFollowing,
  onToggleNotification,
  isTogglingNotification,
  onToggleFighterNotification,
  isTogglingFighterNotification,
  toastMessage,
  toastOpacity,
  toastTranslateY,
}: FightDetailsMenuProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();

  const handleNavigate = (path: string) => {
    onClose();
    router.push(path as any);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={[styles.menuContainer, { backgroundColor: colors.card }]}>
          <View style={styles.menuHeader}>
            <Text style={[styles.menuTitle, { color: colors.text }]}>
              Fight Details
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <FontAwesome name="times" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Consolidated Fight Notification Section (only shown for upcoming fights WITH live tracking) */}
          {onToggleNotification !== undefined && fight.event?.hasLiveTracking === true && (() => {
            // Use notification reasons from the new system if available
            const willBeNotified = fight.notificationReasons?.willBeNotified ?? false;
            const notificationReasons = fight.notificationReasons?.reasons ?? [];

            // Switch shows MANUAL notification status only (so toggle matches visual)
            const hasManualNotification = notificationReasons.some(
              (r: any) => r.type === 'manual' && r.isActive
            );

            // Build the reasons list from the new notification system
            const reasons: string[] = notificationReasons
              .filter(reason => reason.isActive)
              .map(reason => {
                if (reason.type === 'manual') {
                  return 'You set a notification for this fight.';
                } else if (reason.type === 'fighter') {
                  // Extract fighter ID from source string like "Fighter Follow: uuid"
                  const fighterId = reason.source.replace('Fighter Follow: ', '');
                  // Find the fighter name from the fight data
                  if (fighterId === fight.fighter1Id) {
                    return `Following ${getFighterDisplayName(fight.fighter1)}`;
                  } else if (fighterId === fight.fighter2Id) {
                    return `Following ${getFighterDisplayName(fight.fighter2)}`;
                  }
                  return reason.source; // Fallback to raw source
                } else if (reason.type === 'rule') {
                  return reason.source;
                }
                return reason.source;
              });

            const toggleDisabled = isTogglingNotification || isTogglingFighterNotification;

            return (
              <View style={[styles.menuItem, { borderBottomColor: colors.border }]}>
                <View style={styles.notificationRow}>
                  <View style={styles.notificationTextContainer}>
                    <Text style={[styles.menuItemLabel, { color: colors.text, fontWeight: '600' }]}>
                      Fight Notification
                    </Text>
                    {willBeNotified ? (
                      <View style={styles.reasonsContainer}>
                        <Text style={[styles.notificationSubtext, { color: colors.textSecondary }]}>
                          You will be notified 15 minutes before this fight because:
                        </Text>
                        {reasons.map((reason, index) => (
                          <Text key={index} style={[styles.reasonBullet, { color: colors.textSecondary }]}>
                            • {reason}
                          </Text>
                        ))}
                      </View>
                    ) : (
                      <Text style={[styles.notificationSubtext, { color: colors.textSecondary }]}>
                        Get a notification 15 minutes before this fight starts
                      </Text>
                    )}
                  </View>
                  <Switch
                    value={hasManualNotification}
                    disabled={toggleDisabled}
                    onValueChange={(enabled) => {
                      // Toggle the manual notification
                      onToggleNotification(enabled);
                    }}
                    trackColor={{ false: colors.textSecondary, true: colors.tint }}
                    thumbColor="#B0B5BA"
                    style={{ transform: [{ scaleX: 1.2 }, { scaleY: 1.2 }] }}
                  />
                </View>
              </View>
            );
          })()}

          {/* Fighter 1 Link */}
          <TouchableOpacity
            style={[styles.menuItem, { borderBottomColor: colors.border }]}
            onPress={() => handleNavigate(`/fighter/${fight.fighter1.id}`)}
          >
            <View style={styles.menuItemContent}>
              <Text style={[styles.menuItemLabel, { color: colors.textSecondary }]}>Fighter 1</Text>
              <View style={styles.menuItemValueRow}>
                <Text style={[styles.menuItemValue, { color: colors.text }]}>
                  {getFighterDisplayName(fight.fighter1)}
                </Text>
                <FontAwesome name="chevron-right" size={14} color={colors.textSecondary} />
              </View>
            </View>
          </TouchableOpacity>

          {/* Fighter 2 Link */}
          <TouchableOpacity
            style={[styles.menuItem, { borderBottomColor: colors.border }]}
            onPress={() => handleNavigate(`/fighter/${fight.fighter2.id}`)}
          >
            <View style={styles.menuItemContent}>
              <Text style={[styles.menuItemLabel, { color: colors.textSecondary }]}>Fighter 2</Text>
              <View style={styles.menuItemValueRow}>
                <Text style={[styles.menuItemValue, { color: colors.text }]}>
                  {getFighterDisplayName(fight.fighter2)}
                </Text>
                <FontAwesome name="chevron-right" size={14} color={colors.textSecondary} />
              </View>
            </View>
          </TouchableOpacity>

          {/* Event Link */}
          <TouchableOpacity
            style={[styles.menuItem, { borderBottomColor: colors.border }]}
            onPress={() => handleNavigate(`/event/${fight.event.id}`)}
          >
            <View style={styles.menuItemContent}>
              <Text style={[styles.menuItemLabel, { color: colors.textSecondary }]}>Event</Text>
              <View style={styles.menuItemValueRow}>
                <Text style={[styles.menuItemValue, { color: colors.text }]}>
                  {fight.event.name.replace('Fight Night', 'FN')}
                </Text>
                <FontAwesome name="chevron-right" size={14} color={colors.textSecondary} />
              </View>
            </View>
          </TouchableOpacity>

          {/* Weight Class */}
          {fight.weightClass && (
            <View style={[styles.menuItem, { borderBottomColor: colors.border }]}>
              <View style={styles.menuItemContent}>
                <Text style={[styles.menuItemLabel, { color: colors.textSecondary }]}>Weight Class</Text>
                <Text style={[styles.menuItemValue, { color: colors.textSecondary }]}>
                  {fight.isTitle ? `${formatWeightClass(fight.weightClass)} Championship` : formatWeightClass(fight.weightClass)}
                </Text>
              </View>
            </View>
          )}

          {/* Event Date */}
          <View style={[styles.menuItem, { borderBottomWidth: 0 }]}>
            <View style={styles.menuItemContent}>
              <Text style={[styles.menuItemLabel, { color: colors.textSecondary }]}>Date</Text>
              <Text style={[styles.menuItemValue, { color: colors.textSecondary }]}>
                {formatEventDate(fight.event.date)}
              </Text>
            </View>
          </View>
        </View>

          {/* Toast Notification inside modal */}
          {toastMessage && toastOpacity && toastTranslateY && (
            <Animated.View
              style={[
                styles.toastContainer,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  opacity: toastOpacity,
                  transform: [{ translateY: toastTranslateY }],
                },
              ]}
            >
              <FontAwesome name="bell" size={16} color="#10b981" />
              <Text style={[styles.toastText, { color: '#fff' }]}>{toastMessage}</Text>
            </Animated.View>
          )}
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  menuContainer: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  menuItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  menuItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuItemLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  menuItemValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menuItemValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  menuItemSubValue: {
    fontSize: 12,
    marginTop: 2,
  },
  notificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  notificationTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  notificationSubtext: {
    fontSize: 12,
    marginTop: 2,
  },
  reasonsContainer: {
    marginTop: 4,
  },
  reasonBullet: {
    fontSize: 12,
    marginTop: 2,
    paddingLeft: 4,
  },
  toggleHintText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  toastContainer: {
    position: 'absolute',
    bottom: 50,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  toastText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
