import React from 'react';
import { StyleSheet, View, type TextInputProps } from 'react-native';
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
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoCorrect?: TextInputProps['autoCorrect'];
  textContentType?: TextInputProps['textContentType'];
  selectable?: boolean;
  showDivider?: boolean;
}

export function ProfileInfoRow({ icon, label, value, editable = false, onChangeText, inputValue, placeholder, keyboardType = 'default', autoCapitalize = 'words', autoCorrect, textContentType, selectable = false, showDivider = true }: ProfileInfoRowProps) {
  return (
    <View style={[styles.row, !showDivider && styles.rowWithoutDivider]}>
      <View style={styles.labelGroup}>
        {icon ? <Ionicons name={icon} size={18} color={colors.text.muted} /> : null}
        <AppText variant="helper" color="muted" style={styles.label}>{label}</AppText>
      </View>
      {editable ? (
        <View style={styles.input}>
          <TextField value={inputValue} onChangeText={onChangeText} placeholder={placeholder} keyboardType={keyboardType} autoCapitalize={autoCapitalize} autoCorrect={autoCorrect} textContentType={textContentType} accessibilityLabel={label} />
        </View>
      ) : (
        <AppText selectable={selectable} numberOfLines={selectable ? 2 : 1} style={styles.value}>{value}</AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.subtle, paddingVertical: spacing[2] },
  rowWithoutDivider: { borderBottomWidth: 0 },
  labelGroup: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  label: { flex: 1 },
  value: { flex: 1, textAlign: 'right' },
  input: { flex: 1 },
});

const flattenChildren = (children: React.ReactNode): React.ReactNode[] =>
  React.Children.toArray(children).flatMap((child) =>
    React.isValidElement<{ children?: React.ReactNode }>(child) && child.type === React.Fragment
      ? flattenChildren(child.props.children)
      : [child]
  );

/**
 * Liste de lignes d'information: retire le séparateur sous la dernière
 * ligne pour que la carte ne se termine pas par un trait vide.
 */
export function ProfileInfoList({ children }: { children: React.ReactNode }) {
  const items = flattenChildren(children);
  const lastIndex = items.length - 1;
  return (
    <>
      {items.map((child, index) =>
        index === lastIndex && React.isValidElement(child) && child.type === ProfileInfoRow
          ? React.cloneElement(child as React.ReactElement<ProfileInfoRowProps>, { showDivider: false })
          : child
      )}
    </>
  );
}
