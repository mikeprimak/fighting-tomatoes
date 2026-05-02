import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { useSpoilerFree } from '../store/SpoilerFreeContext';

export default function SpoilerToggleButton() {
  const colors = Colors.dark;
  const { spoilerFreeMode, setSpoilerFreeMode } = useSpoilerFree();

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      <Pressable
        onPress={() => setSpoilerFreeMode(!spoilerFreeMode)}
        hitSlop={8}
        style={({ pressed }) => [
          styles.button,
          pressed && { opacity: 0.6 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={spoilerFreeMode ? 'Show fight results' : 'Hide fight results'}
        accessibilityState={{ selected: spoilerFreeMode }}
      >
        <FontAwesome
          name={spoilerFreeMode ? 'eye-slash' : 'eye'}
          size={18}
          color={spoilerFreeMode ? colors.primary : colors.textSecondary}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingHorizontal: 14,
  },
  button: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
