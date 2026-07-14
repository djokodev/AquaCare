import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText, Badge, Card, IconButton } from '@/components/ui';
import { colors, sizing, spacing } from '@/theme';
import type { Product } from '@/types/commerce';
import { getProductBrandAsset } from '@/features/commerce/utils/productBrandAssets';

interface ProductCardProps {
  product: Product;
  proteinLabel: string;
  quickAddLabel: string;
  onPress: () => void;
  onQuickAdd: () => void;
}

export function ProductCard({ product, proteinLabel, quickAddLabel, onPress, onQuickAdd }: ProductCardProps) {
  return (
    <Card variant="outlined" style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityLabel={product.name} onPress={onPress} style={styles.content}>
        <View style={styles.imageWrap}>
          <Image source={getProductBrandAsset(product.brand)} style={styles.image} resizeMode="contain" />
        </View>
        <View style={styles.details}>
          <View style={styles.brandRow}>
            <AppText variant="caption" color="muted">{product.brand.toUpperCase()}</AppText>
            <Ionicons name="chevron-forward" size={sizing.iconSmall} color={colors.brand.primary} />
          </View>
          <AppText variant="bodyStrong" numberOfLines={2}>{product.name}</AppText>
          <View style={styles.meta}>
            <Badge label={`${product.pellet_size_mm} mm`} tone="info" />
            {product.protein_percentage !== null ? <AppText variant="caption" color="muted">{product.protein_percentage}% {proteinLabel}</AppText> : null}
          </View>
          <View style={styles.bottom}>
            <View>
              <AppText variant="caption" color="muted">{product.package_weight_kg} kg</AppText>
              <AppText variant="bodyStrong" color="link">{Number(product.price_per_package).toLocaleString()} FCFA</AppText>
            </View>
          </View>
        </View>
      </Pressable>
      <IconButton icon="cart-outline" variant="surface" accessibilityLabel={quickAddLabel} onPress={onQuickAdd} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  content: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  imageWrap: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface.page, borderRadius: spacing[2] },
  image: { width: 64, height: 64 },
  details: { flex: 1, gap: spacing[1] },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], flexWrap: 'wrap' },
  bottom: { marginTop: spacing[1] },
});
