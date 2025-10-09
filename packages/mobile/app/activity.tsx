import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';
import { FontAwesome } from '@expo/vector-icons';
import { useAuth } from '../store/AuthContext';

export default function ActivityScreen() {
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const activityCategories = [
    {
      title: 'Ratings',
      description: 'All your fight ratings, reviews, and tags',
      icon: 'star',
      route: '/activity/ratings',
      color: '#F5C518',
    },
    {
      title: 'Predictions',
      description: 'Your hype scores and fight predictions',
      icon: 'magic',
      route: '/activity/predictions',
      color: '#9333ea',
    },
  ];

  const styles = createStyles(colors);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'My Activity',
          headerStyle: {
            backgroundColor: colors.card,
          },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}
      />
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <Text style={[styles.headerText, { color: colors.textSecondary }]}>
            Track all your interactions and engagement with fights across the platform
          </Text>

          <View style={styles.categoriesContainer}>
            {activityCategories.map((category, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.categoryCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push(category.route as any)}
              >
                <View style={[styles.iconContainer, { backgroundColor: `${category.color}20` }]}>
                  <FontAwesome name={category.icon as any} size={24} color={category.color} />
                </View>
                <View style={styles.categoryContent}>
                  <Text style={[styles.categoryTitle, { color: colors.text }]}>
                    {category.title}
                  </Text>
                  <Text style={[styles.categoryDescription, { color: colors.textSecondary }]}>
                    {category.description}
                  </Text>
                </View>
                <FontAwesome name="chevron-right" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>

          {/* Stats Summary */}
          <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.summaryTitle, { color: colors.text }]}>Activity Summary</Text>
            <View style={styles.summaryStats}>
              <View style={styles.summaryStatItem}>
                <Text style={[styles.summaryStatValue, { color: colors.primary }]}>{user?.totalRatings || 0}</Text>
                <Text style={[styles.summaryStatLabel, { color: colors.textSecondary }]}>Total Ratings</Text>
              </View>
              <View style={styles.summaryStatItem}>
                <Text style={[styles.summaryStatValue, { color: colors.primary }]}>{user?.totalReviews || 0}</Text>
                <Text style={[styles.summaryStatLabel, { color: colors.textSecondary }]}>Total Reviews</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 16,
  },
  headerText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  categoriesContainer: {
    gap: 12,
    marginBottom: 24,
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 16,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryContent: {
    flex: 1,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  categoryDescription: {
    fontSize: 13,
  },
  summaryCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryStatItem: {
    alignItems: 'center',
  },
  summaryStatValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  summaryStatLabel: {
    fontSize: 12,
  },
});
