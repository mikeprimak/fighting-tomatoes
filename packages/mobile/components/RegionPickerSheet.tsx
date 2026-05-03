import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  useColorScheme,
} from 'react-native';
import { Colors } from '../constants/Colors';
import type { BroadcastRegion } from '../services/api';

export const REGION_FLAGS: Record<BroadcastRegion, string> = {
  US: '🇺🇸',
  CA: '🇨🇦',
  GB: '🇬🇧',
  AU: '🇦🇺',
  NZ: '🇳🇿',
  EU: '🇪🇺',
};

export const REGION_LABELS: Record<BroadcastRegion, string> = {
  US: 'United States',
  CA: 'Canada',
  GB: 'United Kingdom',
  AU: 'Australia',
  NZ: 'New Zealand',
  EU: 'Europe',
};

interface Props {
  visible: boolean;
  currentRegion: BroadcastRegion;
  onClose: () => void;
  /** Pass null to clear the override and fall back to auto-detect. */
  onSelect: (region: BroadcastRegion | null) => void;
  /** When true, show the "Auto-detect" option (used in profile screen). */
  showAutoDetect?: boolean;
}

const REGION_ORDER: BroadcastRegion[] = ['US', 'CA', 'GB', 'AU', 'NZ', 'EU'];

export function RegionPickerSheet({ visible, currentRegion, onClose, onSelect, showAutoDetect = false }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={[styles.title, { color: colors.text }]}>Watch region</Text>
          <Text style={[styles.subtitle, { color: colors.text }]}>
            We use this to pick the right broadcaster for you.
          </Text>

          {showAutoDetect && (
            <TouchableOpacity
              style={[styles.row, { borderColor: colors.border }]}
              onPress={() => onSelect(null)}
            >
              <Text style={[styles.flag]}>📍</Text>
              <Text style={[styles.label, { color: colors.text }]}>Auto-detect from location</Text>
            </TouchableOpacity>
          )}

          {REGION_ORDER.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.row, { borderColor: colors.border }]}
              onPress={() => onSelect(r)}
            >
              <Text style={styles.flag}>{REGION_FLAGS[r]}</Text>
              <Text style={[styles.label, { color: colors.text }]}>{REGION_LABELS[r]}</Text>
              {currentRegion === r ? (
                <Text style={[styles.checkmark, { color: colors.tint }]}>✓</Text>
              ) : null}
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={[styles.cancelButton, { borderColor: colors.border }]} onPress={onClose}>
            <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#000a',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 28,
  },
  handle: {
    alignSelf: 'center',
    width: 38, height: 4, borderRadius: 2,
    backgroundColor: '#666', marginBottom: 14,
  },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 13, opacity: 0.7, marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  flag: { fontSize: 22, marginRight: 12 },
  label: { fontSize: 16, flex: 1 },
  checkmark: { fontSize: 18, fontWeight: '700' },
  cancelButton: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelText: { fontSize: 15, fontWeight: '600' },
});
