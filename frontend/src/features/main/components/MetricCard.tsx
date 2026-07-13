import React from "react";
import { StyleSheet, View } from "react-native";
import { AppText, Card } from "@/components/ui";
import { spacing } from "@/theme";

export interface MetricCardProps {
  value: string | number;
  label: string;
  subtitle?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ value, label, subtitle }) => {
  const metricValue = String(value);
  const unitMatch = metricValue.match(/^(.*?)(\s+(?:FCFA|jours|days|kg))$/iu);

  return (
    <Card variant="outlined" style={styles.card}>
      <View style={styles.valueRow}>
        <AppText
          variant="metric"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={styles.metricValue}
        >
          {unitMatch ? unitMatch[1] : metricValue}
        </AppText>
        {unitMatch ? (
          <AppText variant="caption" color="link" style={styles.unit}>
            {unitMatch[2].trim()}
          </AppText>
        ) : null}
      </View>
      <AppText variant="caption" color="muted">
        {label}
      </AppText>
      {subtitle ? (
        <AppText variant="caption" color="muted">
          {subtitle}
        </AppText>
      ) : null}
    </Card>
  );
};

export default React.memo(MetricCard);

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: "45%", gap: spacing[1] },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "nowrap",
  },
  metricValue: { flexShrink: 1 },
  unit: { marginLeft: spacing[1] },
});
