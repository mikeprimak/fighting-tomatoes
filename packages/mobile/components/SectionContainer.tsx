import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

interface SectionContainerProps {
  title: string;
  icon: string;
  iconColor?: string;
  headerBgColor?: string;
  containerBgColorDark?: string;
  containerBgColorLight?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}

export default function SectionContainer({
  title,
  icon,
  iconColor = '#000',
  headerBgColor = '#F5C518',
  containerBgColorDark = 'rgba(245, 197, 24, 0.05)',
  containerBgColorLight = 'rgba(245, 197, 24, 0.08)',
  headerRight,
  children,
}: SectionContainerProps) {
  const colorScheme = useColorScheme();

  return (
    <View>
      {/* Title Bar */}
      <View style={[styles.titleBar, { backgroundColor: headerBgColor }]}>
        <View style={styles.titleContent}>
          <FontAwesome name={icon as any} size={18} color={iconColor} />
          <Text style={[styles.titleText, { color: iconColor }]}>
            {title}
          </Text>
          {headerRight}
        </View>
      </View>

      {/* Container */}
      <View style={[
        styles.container,
        {
          backgroundColor: colorScheme === 'dark' ? containerBgColorDark : containerBgColorLight,
        }
      ]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  titleBar: {
    paddingVertical: 12,
    marginHorizontal: 12,
    marginTop: 16,
    marginBottom: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  titleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  titleText: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  container: {
    marginHorizontal: 12,
    marginTop: 0,
    marginBottom: 16,
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 12,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
});
