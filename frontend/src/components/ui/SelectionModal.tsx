import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "./AppText";
import { Divider } from "./Divider";
import { colors, radii, shadows, spacing } from "@/theme";
export interface SelectionOption {
  value: string;
  label: string;
  disabled?: boolean;
}
interface SelectionModalProps {
  visible: boolean;
  title: string;
  options: SelectionOption[];
  selectedValue?: string;
  onSelect: (value: string) => void;
  onClose: () => void;
  closeLabel: string;
  emptyLabel: string;
  loading?: boolean;
}
export function SelectionModal({
  visible,
  title,
  options,
  selectedValue,
  onSelect,
  onClose,
  closeLabel,
  emptyLabel,
  loading = false,
}: SelectionModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <SafeAreaView style={styles.sheet}>
          <View style={styles.header}>
            <AppText variant="cardTitle" numberOfLines={2}>
              {title}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={closeLabel}
              onPress={onClose}
              style={styles.close}
            >
              <Ionicons name="close" size={24} color={colors.text.primary} />
            </Pressable>
          </View>
          <Divider />
          {loading ? (
            <View style={styles.state}>
              <ActivityIndicator color={colors.brand.primary} />
            </View>
          ) : (
            <View style={styles.optionsContainer}>
              <FlatList
                data={options}
                keyExtractor={(item) => item.value}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                  <View style={styles.state}>
                    <AppText color="muted">{emptyLabel}</AppText>
                  </View>
                }
                renderItem={({ item }) => {
                  const selected = item.value === selectedValue;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={item.label}
                      accessibilityState={{ selected, disabled: item.disabled }}
                      disabled={item.disabled}
                      onPress={() => onSelect(item.value)}
                      style={({ pressed }) => [
                        styles.option,
                        selected && styles.selected,
                        (pressed || item.disabled) && {
                          opacity: item.disabled ? 0.5 : 0.8,
                        },
                      ]}
                    >
                      <AppText variant="body" color={selected ? "link" : "primary"}>
                        {item.label}
                      </AppText>
                      {selected ? (
                        <Ionicons
                          name="checkmark"
                          size={20}
                          color={colors.brand.primary}
                        />
                      ) : null}
                    </Pressable>
                  );
                }}
                ItemSeparatorComponent={Divider}
              />
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.overlay.default,
  },
  sheet: {
    maxHeight: "80%",
    backgroundColor: colors.surface.card,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    overflow: "hidden",
    ...shadows.large,
  },
  optionsContainer: {
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[5],
    flexShrink: 1,
  },
  header: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[5],
  },
  close: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  option: {
    width: "100%",
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 0,
    paddingVertical: spacing[3],
  },
  listContent: { paddingBottom: spacing[3] },
  selected: { backgroundColor: colors.surface.selected },
  state: {
    minHeight: 144,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing[5],
  },
});
