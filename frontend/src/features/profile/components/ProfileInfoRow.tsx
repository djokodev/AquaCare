import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText, TextField } from '@/components/ui';
import { colors, spacing } from '@/theme';

interface ProfileInfoRowProps {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  editable?: boolean;
  onChangeText?: (text: string) => void;
  inputValue?: string;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
  selectable?: boolean;
}

export function ProfileInfoRow({ icon, label, value, editable = false, onChangeText, inputValue, placeholder, keyboardType = 'default', selectable = false }: ProfileInfoRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.labelGroup}>
        {icon ? <Ionicons name={icon} size={18} color={colors.text.muted} /> : null}
        <AppText variant="caption" color="muted" style={styles.label}>{label}</AppText>
      </View>
      {editable ? (
        <View style={styles.input}>
          <TextField value={inputValue} onChangeText={onChangeText} placeholder={placeholder} keyboardType={keyboardType} autoCapitalize="words" accessibilityLabel={label} />
        </View>
      ) : (
        <AppText selectable={selectable} numberOfLines={selectable ? 2 : 1} style={styles.value}>{value}</AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.subtle, paddingVertical: spacing[2] },
  labelGroup: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  label: { flex: 1 },
  value: { flex: 1, textAlign: 'right' },
  input: { flex: 1 },
});
