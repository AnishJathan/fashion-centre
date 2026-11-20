import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { Brand, Product } from './core/domain';
import { Button, Photo, usePalette } from './ui';

export function CatalogueTitle({ eyebrow, title, description, size = 'page' }: {
  eyebrow: string;
  title: string;
  description?: string;
  size?: 'page' | 'browse';
}) {
  const p = usePalette();
  return (
    <View style={styles.titleBlock}>
      <Text style={[styles.eyebrow, { color: p.muted }]}>{eyebrow}</Text>
      <Text accessibilityRole="header" style={[size === 'browse' ? styles.browseTitle : styles.pageTitle, { color: p.text }]}>{title}</Text>
      {!!description && <Text style={[styles.description, { color: p.text }]}>{description}</Text>}
    </View>
  );
}

export function CatalogueHero({ product, open }: { product: Product; open: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`View featured ${product.name} from ${product.brandName}`} onPress={open} style={styles.hero}>
      <Photo uri={product.image} label={product.name} height={340} contain allowRetry={false} />
      <View style={styles.heroCaption} pointerEvents="none" accessible={false}>
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} accessible={false}>
          <Defs>
            <LinearGradient id="hero-caption" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#190C2E" stopOpacity={0} />
              <Stop offset="1" stopColor="#190C2E" stopOpacity={.9} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#hero-caption)" />
        </Svg>
        <Text style={styles.heroSource}>FROM {product.brandName}</Text>
        <Text style={styles.heroTitle} numberOfLines={2}>{product.name}</Text>
      </View>
    </Pressable>
  );
}

export function CatalogueEmpty({ title, description, onManage }: {
  title: string;
  description: string;
  onManage: () => void;
}) {
  const p = usePalette();
  return (
    <View testID="catalogue-empty" style={[styles.empty, { backgroundColor: p.surface, borderColor: p.line }]}>
      <Text style={[styles.emptyEyebrow, { color: p.muted }]}>YOUR STORES. YOUR SELECTION.</Text>
      <Text accessibilityRole="header" style={[styles.emptyTitle, { color: p.text }]}>{title}</Text>
      <Text style={[styles.emptyDescription, { color: p.muted }]}>{description}</Text>
      <Button label="Manage demo stores" onPress={onManage} style={styles.inlineButton} />
    </View>
  );
}

export function CatalogueFooter({ brandName }: { brandName?: string }) {
  const p = usePalette();
  return (
    <View style={styles.footer}>
      <Text style={[styles.footerTitle, { color: p.text }]}>{brandName || 'Fashion Centre'}</Text>
      <Text style={[styles.footerCaption, { color: p.muted }]}>{brandName ? 'Your selected Brand Centre.' : 'Only your onboarded demo catalogues.'}</Text>
      <Text style={[styles.footerFine, { color: p.muted }]}>Public Mock Shop products, prices and availability are fictional. Demo checkout stays on this device. Account sign-in and saved-photo try-on require configured services.</Text>
    </View>
  );
}

export function CatalogueStoreCard({ brand, followed, onOpen, onFollow, openLabel }: {
  brand: Brand;
  followed: boolean;
  onOpen: () => void;
  onFollow: () => void;
  openLabel: string;
}) {
  const p = usePalette();
  return (
    <View style={[styles.storeCard, { backgroundColor: p.surface }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={openLabel} onPress={onOpen} style={styles.storeLink}>
        {!!brand.image && <View style={styles.storePhoto}><Photo uri={brand.image} label={brand.name} height={146} contain allowRetry={false} /></View>}
        <View style={styles.storeText}>
          <Text style={[styles.storeTitle, { color: p.text }]}>{brand.name}</Text>
          <Text style={[styles.storeCount, { color: p.muted }]}>{brand.products.length} loaded products{brand.more ? ' · Partial catalogue' : ''}</Text>
          <Text style={[styles.storeVisit, { color: p.text }]}>Visit demo store →</Text>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`${followed ? 'Unfollow' : 'Follow'} ${brand.name}`} accessibilityState={{ selected: followed }} onPress={onFollow} style={styles.follow}>
        <Text style={[styles.storeVisit, { color: p.accent }]}>{followed ? 'Following' : 'Follow'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  titleBlock: { gap: 10 },
  eyebrow: { fontSize: 9, lineHeight: 13, letterSpacing: 1.25, fontWeight: '700' },
  pageTitle: { fontSize: 34, lineHeight: 39, letterSpacing: -1.4, fontWeight: '800' },
  browseTitle: { fontSize: 29, lineHeight: 39, letterSpacing: -.8, fontWeight: '800' },
  description: { fontSize: 15, lineHeight: 24 },
  empty: { borderRadius: 24, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 42, gap: 16 },
  emptyEyebrow: { color: '#786983', fontSize: 13, lineHeight: 19, letterSpacing: 1, fontWeight: '700', textAlign: 'center' },
  emptyTitle: { fontSize: 27, lineHeight: 33, letterSpacing: -.75, fontWeight: '800', textAlign: 'center' },
  emptyDescription: { fontSize: 14, lineHeight: 22, textAlign: 'center', paddingHorizontal: 8 },
  inlineButton: { alignSelf: 'center', paddingHorizontal: 22, borderRadius: 24 },
  hero: { minHeight: 340, borderRadius: 16, overflow: 'hidden' },
  heroCaption: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingVertical: 22, paddingHorizontal: 26, paddingTop: 28, minHeight: 91, justifyContent: 'flex-end', gap: 3 },
  heroSource: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: '#FFF' },
  heroTitle: { fontSize: 20, lineHeight: 25, fontWeight: '800', color: '#FFF' },
  footer: { paddingVertical: 28, alignItems: 'center', gap: 15 },
  footerTitle: { fontSize: 20, lineHeight: 25, fontWeight: '800', letterSpacing: -.5, textAlign: 'center' },
  footerCaption: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
  footerFine: { fontSize: 10, lineHeight: 17, textAlign: 'center' },
  storeCard: { borderRadius: 13, overflow: 'hidden' },
  storeLink: { flexDirection: 'row', minHeight: 96, alignItems: 'flex-start', gap: 14 },
  storePhoto: { width: '34%', minWidth: 60 },
  storeText: { flex: 1, paddingVertical: 16, paddingHorizontal: 5, gap: 8 },
  storeTitle: { fontSize: 18, lineHeight: 23, fontWeight: '800', letterSpacing: -.3 },
  storeCount: { fontSize: 11, lineHeight: 16 },
  storeVisit: { fontSize: 12, lineHeight: 17, fontWeight: '700' },
  follow: { minHeight: 48, paddingHorizontal: 14, alignItems: 'flex-end', justifyContent: 'center' },
});
