import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Switch,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { CustomAlert } from '../components/CustomAlert';

interface FollowedFighter {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  wins: number;
  losses: number;
  draws: number;
  weightClass?: string;
  profileImage?: string;
  startOfFightNotification: boolean;
  dayBeforeNotification: boolean;
}

export default function FollowedFightersScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { alertState, showSuccess, showError, hideAlert } = useCustomAlert();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['followedFighters'],
    queryFn: () => apiService.getFollowedFighters(),
  });

  const updateNotificationMutation = useMutation({
    mutationFn: ({ fighterId, preferences }: { fighterId: string; preferences: any }) =>
      apiService.updateFighterNotificationPreferences(fighterId, preferences),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followedFighters'] });
      queryClient.invalidateQueries({ queryKey: ['fighters'] });
      queryClient.invalidateQueries({ queryKey: ['fights'] });
    },
    onError: () => {
      showError('Failed to update notification preference');
    },
  });

  const handleToggleNotification = (fighterId: string, currentValue: boolean) => {
    updateNotificationMutation.mutate({
      fighterId,
      preferences: { startOfFightNotification: !currentValue },
    });
  };

  const getFighterImage = (fighter: FollowedFighter) => {
    if (fighter.profileImage) {
      return { uri: fighter.profileImage };
    }
    return require('../assets/fighters/fighter-default-alpha.png');
  };

  const styles = createStyles(colors);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen
          options={{
            title: 'Followed Fighters',
            headerStyle: { backgroundColor: colors.card },
            headerTintColor: colors.text,
            headerShadowVisible: false,
          }}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen
          options={{
            title: 'Followed Fighters',
            headerStyle: { backgroundColor: colors.card },
            headerTintColor: colors.text,
            headerShadowVisible: false,
          }}
        />
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.error }]}>
            Failed to load followed fighters
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const fighters = data?.fighters || [];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Followed Fighters',
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}
      />

      {fighters.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No fighters with notifications enabled.
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Follow fighters from their profile pages to get notified when they fight!
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <Text style={[styles.headerText, { color: colors.textSecondary }]}>
            Fighters you follow. Toggle ON to get notified for all their upcoming fights.
          </Text>

          {fighters.map((fighter: FollowedFighter) => (
            <View
              key={fighter.id}
              style={[styles.fighterRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
            >
              <Image
                source={getFighterImage(fighter)}
                style={styles.fighterImage}
              />
              <View style={styles.fighterInfo}>
                <Text style={[styles.fighterName, { color: colors.text }]}>
                  {fighter.firstName} {fighter.lastName}
                </Text>
                {fighter.nickname && (
                  <Text style={[styles.fighterNickname, { color: colors.textSecondary }]}>
                    "{fighter.nickname}"
                  </Text>
                )}
                <Text style={[styles.fighterRecord, { color: colors.textSecondary }]}>
                  {fighter.wins}-{fighter.losses}-{fighter.draws}
                  {fighter.weightClass && ` • ${fighter.weightClass}`}
                </Text>
              </View>
              <Switch
                value={fighter.startOfFightNotification}
                onValueChange={() => handleToggleNotification(fighter.id, fighter.startOfFightNotification)}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={fighter.startOfFightNotification ? colors.textOnAccent : colors.textSecondary}
                disabled={updateNotificationMutation.isPending}
              />
            </View>
          ))}
        </ScrollView>
      )}

      {/* Custom Alert */}
      <CustomAlert {...alertState} onDismiss={hideAlert} />
    </SafeAreaView>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
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
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    emptyText: {
      fontSize: 18,
      fontWeight: '600',
      textAlign: 'center',
      marginBottom: 8,
    },
    emptySubtext: {
      fontSize: 14,
      textAlign: 'center',
    },
    scrollContainer: {
      padding: 16,
      paddingBottom: 32,
    },
    headerText: {
      fontSize: 14,
      marginBottom: 16,
      paddingHorizontal: 4,
    },
    fighterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderRadius: 12,
      marginBottom: 12,
      borderBottomWidth: 1,
    },
    fighterImage: {
      width: 60,
      height: 60,
      borderRadius: 30,
      marginRight: 16,
    },
    fighterInfo: {
      flex: 1,
    },
    fighterName: {
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 2,
    },
    fighterNickname: {
      fontSize: 13,
      fontStyle: 'italic',
      marginBottom: 4,
    },
    fighterRecord: {
      fontSize: 13,
    },
  });
