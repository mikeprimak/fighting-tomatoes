import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, useColorScheme, Switch, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';

interface Fighter {
  id: string;
  firstName: string;
  lastName: string;
}

interface Event {
  id: string;
  name: string;
}

interface Fight {
  fighter1: Fighter;
  fighter2: Fighter;
  fighter1Id: string;
  fighter2Id: string;
  event: Event;
  isFollowingFighter1?: boolean;
  isFollowingFighter2?: boolean;
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
}

export default function FightDetailsMenu({
  fight,
  visible,
  onClose,
  isFollowing,
  onToggleNotification,
  isTogglingNotification,
  onToggleFighterNotification,
  isTogglingFighterNotification,
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

          {/* Consolidated Fight Notification Section (only shown for upcoming fights) */}
          {onToggleNotification !== undefined && (() => {
            // Determine if user will be notified (any toggle is on)
            const hasManualNotification = isFollowing ?? false;
            const hasFighter1Notification = fight.isFollowingFighter1 === true;
            const hasFighter2Notification = fight.isFollowingFighter2 === true;
            const hasHypedFightNotification = fight.isHypedFight === true;
            const willBeNotified = hasManualNotification || hasFighter1Notification || hasFighter2Notification || hasHypedFightNotification;

            // Check if user is following fighters (regardless of notification status)
            const isFollowingFighter1 = fight.isFollowingFighter1 !== undefined;
            const isFollowingFighter2 = fight.isFollowingFighter2 !== undefined;

            // Build the reasons list
            const reasons: string[] = [];
            if (hasManualNotification) {
              reasons.push('You have manually set a notification');
            }
            if (hasFighter1Notification) {
              reasons.push(`You have ${fight.fighter1.firstName} ${fight.fighter1.lastName} notifications turned on`);
            }
            if (hasFighter2Notification) {
              reasons.push(`You have ${fight.fighter2.firstName} ${fight.fighter2.lastName} notifications turned on`);
            }
            if (hasHypedFightNotification) {
              reasons.push('You have hyped fights notifications on');
            }

            // Determine toggle behavior
            const hasFighterNotifications = hasFighter1Notification || hasFighter2Notification;
            const isFollowingAnyFighter = isFollowingFighter1 || isFollowingFighter2;

            // Build hint text
            let hintText = '';
            if (isFollowingAnyFighter) {
              hintText = 'Toggle to deactivate for this fight only';
            } else if (willBeNotified) {
              hintText = 'Toggle to deactivate for this fight only';
            }

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
                          You will be notified before this fight because:
                        </Text>
                        {reasons.map((reason, index) => (
                          <Text key={index} style={[styles.reasonBullet, { color: colors.textSecondary }]}>
                            • {reason}
                          </Text>
                        ))}
                        {hintText && (
                          <Text style={[styles.toggleHintText, { color: colors.textSecondary, marginTop: 4 }]}>
                            {hintText}
                          </Text>
                        )}
                      </View>
                    ) : (
                      <Text style={[styles.notificationSubtext, { color: colors.textSecondary }]}>
                        Get a notification 15 minutes before this fight starts
                      </Text>
                    )}
                  </View>
                  <Switch
                    value={willBeNotified}
                    disabled={isTogglingNotification || isTogglingFighterNotification}
                    onValueChange={(enabled) => {
                      // When toggling OFF: disable all active notification sources OR create an opt-out
                      if (!enabled) {
                        if (hasManualNotification) {
                          onToggleNotification(false);
                        }
                        if (isFollowingFighter1 && onToggleFighterNotification) {
                          onToggleFighterNotification(fight.fighter1Id, false);
                        }
                        if (isFollowingFighter2 && onToggleFighterNotification) {
                          onToggleFighterNotification(fight.fighter2Id, false);
                        }
                        // If only hyped fight notification is active, create an opt-out (inactive FightAlert)
                        if (hasHypedFightNotification && !hasManualNotification && !hasFighterNotifications) {
                          onToggleNotification(false);
                        }
                      } else {
                        // When toggling ON: enable all available notification sources
                        if (hasManualNotification) {
                          onToggleNotification(true);
                        }
                        if (isFollowingFighter1 && onToggleFighterNotification) {
                          onToggleFighterNotification(fight.fighter1Id, true);
                        }
                        if (isFollowingFighter2 && onToggleFighterNotification) {
                          onToggleFighterNotification(fight.fighter2Id, true);
                        }
                        // If no existing sources (just opted out of hyped fight), enable manual notification
                        if (!hasManualNotification && !isFollowingFighter1 && !isFollowingFighter2) {
                          onToggleNotification(true);
                        }
                      }
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
                  {fight.fighter1.firstName} {fight.fighter1.lastName}
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
                  {fight.fighter2.firstName} {fight.fighter2.lastName}
                </Text>
                <FontAwesome name="chevron-right" size={14} color={colors.textSecondary} />
              </View>
            </View>
          </TouchableOpacity>

          {/* Event Link */}
          <TouchableOpacity
            style={[styles.menuItem, { borderBottomWidth: 0 }]}
            onPress={() => handleNavigate(`/event/${fight.event.id}`)}
          >
            <View style={styles.menuItemContent}>
              <Text style={[styles.menuItemLabel, { color: colors.textSecondary }]}>Event</Text>
              <View style={styles.menuItemValueRow}>
                <Text style={[styles.menuItemValue, { color: colors.text }]}>
                  {fight.event.name}
                </Text>
                <FontAwesome name="chevron-right" size={14} color={colors.textSecondary} />
              </View>
            </View>
          </TouchableOpacity>
        </View>
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
});
