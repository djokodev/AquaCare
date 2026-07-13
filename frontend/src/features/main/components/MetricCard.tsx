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
  const unitMatch = metricValue.match(/^(.*?)(\s+(?:FCFA|jours|days))$/u);

  return (
    <Card variant="outlined" style={styles.card}>
      <AppText variant="metric" numberOfLines={2}>
        {unitMatch ? unitMatch[1] : metricValue}
        {unitMatch ? (
          <AppText variant="caption" color="muted">
            {unitMatch[2]}
          </AppText>
        ) : null}
      </AppText>
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
});
