import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, BackHandler, FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, findNodeHandle, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { metrics, pageLayout } from './design';
import { shoppingGridLayout } from './shoppingLayout';
import { HOME_FEED_BATCH, homeFeedRows, homeProductKey, uniqueHomeProducts } from './homeFeed';
import { useApp } from './state';
import { FollowedBrandRail } from './FollowedBrandRail';
import { BrandMark } from './BrandMark';
import { Button, Icon, Photo, useBottomOverlay, usePalette } from './ui';
import { money, type Product } from './core/domain';
import type { Route } from './navigation';
import { homeCategories, homePrice, homeSuggestions, homeValueCollections, type BrowseSelection } from './commerceHome';

const citrus = '#FFEA52', ink = '#101B2D';
const collectionColors = ['#FFEA52', '#83D6FF', '#FF998A', '#A5F0D1'];
export function CommerceHome({ navigate, onBrowse, children }: {
  navigate: (route: Route) => void; onBrowse: (selection?: BrowseSelection) => void; children?: React.ReactNode;
}) {
  const app = useApp(), p = usePalette(), window = useWindowDimensions();
  const insets = useSafeAreaInsets(), headerHeight = useHeaderHeight(), bottomOverlay = useBottomOverlay();
  const [viewportWidth, setViewportWidth] = useState(window.width);
  const layout = pageLayout(viewportWidth, window.fontScale, insets);
  const products = uniqueHomeProducts(app.products);
  const signature = JSON.stringify(products.map(homeProductKey));
  const [page, setPage] = useState({ signature, count: HOME_FEED_BATCH });
  const [appending, setAppending] = useState(false);
  const frame = useRef<number | null>(null), pending = useRef(false), active = useRef(false);
  const snapshot = useRef({ signature, total: products.length, loading: app.catalogueLoading });
  snapshot.current = { signature, total: products.length, loading: app.catalogueLoading };
  const count = Math.min(products.length, page.signature === signature ? page.count : HOME_FEED_BATCH);
  const hasMore = count < products.length;
  const cancelAppend = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null; pending.current = false; setAppending(false);
  }, []);
  useEffect(() => { cancelAppend(); }, [signature, cancelAppend]);
  useFocusEffect(useCallback(() => {
    active.current = true;
    return () => { active.current = false; cancelAppend(); };
  }, [cancelAppend]));
  const loadMore = () => {
    if (!active.current || pending.current || app.catalogueLoading || !hasMore) return;
    pending.current = true; setAppending(true);
    // Local batches, not a fake network delay. Yield a frame for the scroll gesture.
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const current = snapshot.current;
      if (active.current && current.signature === signature && !current.loading) {
        setPage(previous => ({ signature, count: Math.min(current.total, (previous.signature === signature ? previous.count : HOME_FEED_BATCH) + HOME_FEED_BATCH) }));
      }
      pending.current = false; setAppending(false);
    });
  };
  const headerStart = app.theme === 'dark' ? '#193D64' : '#C5E8FF';
  const contentStyle = { width: '100%' as const, maxWidth: metrics.maxContentWidth, alignSelf: 'center' as const, paddingLeft: layout.paddingLeft, paddingRight: layout.paddingRight };

  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInput = useRef<React.ElementRef<typeof TextInput>>(null);
  const searchToggle = useRef<React.ElementRef<typeof View>>(null);
  const restoreSearchFocus = useRef(false);
  const closeSearch = useCallback(() => {
    Keyboard.dismiss();
    restoreSearchFocus.current = true;
    setSearchOpen(false);
  }, []);
  useEffect(() => {
    if (searchOpen) {
      searchInput.current?.focus();
      if (Platform.OS !== 'web') {
        const handle = findNodeHandle(searchInput.current);
        if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
      }
    } else if (restoreSearchFocus.current) {
      restoreSearchFocus.current = false;
      searchToggle.current?.focus();
      if (Platform.OS !== 'web') {
        const handle = findNodeHandle(searchToggle.current);
        if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
      }
    }
  }, [searchOpen]);
  // Home stays mounted behind product pages. Only intercept Back while focused.
  useFocusEffect(useCallback(() => {
    if (!searchOpen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeSearch();
      return true;
    });
    return () => subscription.remove();
  }, [searchOpen, closeSearch]));
  const [pageWidth, setPageWidth] = useState(Math.min(window.width - 40, 984));
  const categories = homeCategories(products);
  const collections = homeValueCollections(products), suggestions = homeSuggestions(products, query);
  const grid = shoppingGridLayout(pageWidth, window.fontScale);
  const rows = homeFeedRows(products, count, grid.columns);
  const cardWidth = Math.min(176, Math.max(126, (pageWidth - 8) / 2));
  const view = (product: Product) => {
    Keyboard.dismiss();
    navigate({ name: 'product', productId: product.id, brandId: product.brandId });
  };
  const submitSearch = () => {
    Keyboard.dismiss();
    onBrowse({ query: query.trim() });
  };
  // Long labels may wrap and grow vertically, without stealing the pinned search target.
  const searchToggleWidth = query.trim() ? Math.max(48, pageWidth * .45) : 48;
  const categoryWidth = (label: string) => Math.min(
    Math.max(48, pageWidth - searchToggleWidth - 48 - 12),
    Math.max(48, Math.min(112, label.length * 5 + 8) * window.fontScale),
  );
  function SectionTitle({ title, subtitle, action = 'See all', onPress }: { title: string; subtitle?: string; action?: string; onPress: () => void }) {
    return <View style={s.sectionHeader}><View style={{ flex: 1, gap: 3 }}><Text accessibilityRole="header" style={[s.sectionTitle, { color: p.text }]}>{title}</Text>{subtitle ? <Text style={[s.small, { color: p.muted }]}>{subtitle}</Text> : null}</View><Pressable accessibilityRole="button" onPress={onPress} style={s.sectionLink} hitSlop={{ top: 4, bottom: 4 }}><Text style={{ fontWeight: '700', color: p.accent, fontSize: 13 }}>{action}</Text><Icon name="arrow-right" color={p.accent} size={17} /></Pressable></View>;
  }
  return <KeyboardAvoidingView testID="home-feed-screen" onLayout={event => setViewportWidth(event.nativeEvent.layout.width)} style={{ flex: 1, minWidth: 0, backgroundColor: p.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
    <View testID="home-pinned-controls" style={[contentStyle, { paddingTop: 4, paddingBottom: 3, backgroundColor: p.tint, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.line }]}>
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', inset: 0 }}>
      <Svg width="100%" height="100%" accessible={false} focusable={false}><Defs><LinearGradient id="home-header-wash" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={headerStart} /><Stop offset="1" stopColor={p.background} /></LinearGradient></Defs><Rect width="100%" height="100%" fill="url(#home-header-wash)" /></Svg>
    </View>
    <View onLayout={event => setPageWidth(event.nativeEvent.layout.width)}>
    <FollowedBrandRail navigate={navigate} />
    <View testID="home-discovery-controls" style={s.searchBlock}>
      <View testID="home-discovery-row" style={s.discoveryRow} onAccessibilityEscape={searchOpen ? closeSearch : undefined}>
        <Pressable
          ref={searchToggle}
          testID="home-search-toggle"
          accessibilityRole="button"
          accessibilityLabel={searchOpen ? 'Close search' : query.trim() ? `Edit search: ${query.trim()}` : 'Search catalogue'}
          accessibilityHint={searchOpen ? 'Return to categories. Your search text is kept.' : 'Open the search field for styles, categories and stores.'}
          accessibilityState={{ expanded: searchOpen }}
          onPress={() => searchOpen ? closeSearch() : setSearchOpen(true)}
          style={[s.searchToggle, { maxWidth: searchOpen ? 48 : searchToggleWidth }]}
        >
          <View style={[s.smallControl, { backgroundColor: p.tint }]}><Icon name={searchOpen ? 'arrow-left' : 'search'} color={p.accent} size={18} /></View>
          {!searchOpen && !!query.trim() && <Text numberOfLines={1} style={{ flexShrink: 1, color: p.accent, fontSize: 12, lineHeight: 18 }}>{query.trim()}</Text>}
        </Pressable>
        {searchOpen ? <View testID="home-search-field" style={[s.search, { borderColor: p.controlLine, backgroundColor: p.surface }]}>
          <TextInput
            ref={searchInput}
            testID="home-search-input"
            accessibilityLabel="Search fashion, categories and stores"
            accessibilityHint="Type to see suggestions, then use the Search key to view all matches."
            placeholder="Search your next fit"
            placeholderTextColor={p.muted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={submitSearch}
            onKeyPress={({ nativeEvent }) => { if (nativeEvent.key === 'Escape') closeSearch(); }}
            onAccessibilityEscape={closeSearch}
            style={{ flex: 1, minWidth: 0, minHeight: 46, color: p.text, fontSize: 13, paddingVertical: 6 }}
          />
          {query ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => { setQuery(''); searchInput.current?.focus(); }} style={s.clearSearch}><Icon name="x" color={p.accent} size={16} /></Pressable> : null}
        </View> : <ScrollView
          horizontal
          testID="home-category-shortcuts"
          accessibilityLabel="Shop by category"
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={{ flex: 1, minWidth: 0 }}
          contentContainerStyle={{ gap: 6, alignItems: 'flex-start' }}
        >
          <Pressable accessibilityRole="button" accessibilityLabel="Shop all" onPress={() => onBrowse()} style={[s.category, { width: categoryWidth('Shop all') }]}><View style={[s.categoryCircle, { backgroundColor: p.accent, alignItems: 'center', justifyContent: 'center' }]}><Icon name="grid" size={19} color={p.onAccent} /></View><Text style={[s.categoryLabel, { color: p.accent }]}>Shop all</Text><View testID="home-category-indicator" style={{ position: 'absolute', bottom: 0, width: 24, height: 3, borderRadius: 2, backgroundColor: p.accent }} /></Pressable>
          {categories.map((group, index) => <Pressable key={group.category} accessibilityRole="button" accessibilityLabel={group.category} accessibilityHint={`Browse ${group.category} in the catalogue.`} onPress={() => onBrowse({ category: group.category })} style={[s.category, { width: categoryWidth(group.category) }]}><View style={[s.categoryCircle, { borderWidth: 1, borderColor: p.line }]}><Photo uri={group.image} label={group.category} height={28} allowRetry={false} /></View><Text style={[s.categoryLabel, { color: p.text }]}>{group.category}</Text></Pressable>)}
        </ScrollView>}
        {!searchOpen && <Pressable
          testID="home-filter-toggle"
          accessibilityRole="button"
          accessibilityLabel="Filters & sort"
          accessibilityHint="Open catalogue filters for category, store and sort order."
          onPress={() => onBrowse({ showFilters: true, ...(query.trim() ? { query: query.trim() } : {}) })}
          style={s.filterToggle}
        ><View style={[s.smallControl, { borderWidth: 1, borderColor: p.controlLine, backgroundColor: p.surface }]}><Icon name="sliders" size={17} color={p.accent} /></View></Pressable>}
      </View>
      {searchOpen && query.trim() ? <ScrollView testID="home-search-suggestions" keyboardShouldPersistTaps="handled" style={{ maxHeight: Math.min(220, window.height * .28), backgroundColor: p.surface, borderRadius: 13 }} contentContainerStyle={{ padding: 6 }}>
        {suggestions.map(product => <Pressable key={product.id} accessibilityRole="button" accessibilityLabel={`View ${product.name}, ${product.brandName}, ${product.category}`} onPress={() => view(product)} style={s.suggestion}><Icon name="search" size={16} color={p.muted} /><View style={{ flex: 1 }}><Text style={{ color: p.text, fontSize: 14, fontWeight: '600' }}>{product.name}</Text><Text style={[s.small, { color: p.muted }]}>{product.brandName} · {product.category}</Text></View><Icon name="arrow-up-right" size={17} color={p.accent} /></Pressable>)}
        {!suggestions.length && <Text style={{ padding: 12, color: p.muted }}>No matching items in the loaded catalogue.</Text>}
        <Button label={`Search for “${query.trim()}”`} onPress={submitSearch} />
      </ScrollView> : null}
    </View>
    </View></View>
    <FlatList
      testID="home-product-feed"
      data={rows}
      keyExtractor={row => row.key}
      renderItem={({ item }) => <View style={{ flexDirection: 'row', gap: grid.gap, paddingBottom: 14 }}>{item.products.map(product => <HomeProductCard key={homeProductKey(product)} product={product} cardWidth={grid.cardWidth} navigate={navigate} />)}</View>}
      style={{ flex: 1, minWidth: 0 }}
      contentContainerStyle={[contentStyle, { paddingTop: 4, paddingBottom: Math.max(32, insets.bottom + 20, bottomOverlay + 12) }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      showsVerticalScrollIndicator={false}
      initialNumToRender={4}
      maxToRenderPerBatch={4}
      windowSize={7}
      removeClippedSubviews={false}
      onEndReached={loadMore}
      onEndReachedThreshold={.5}
      onRefresh={() => { if (!app.catalogueLoading) void app.reload(); }}
      refreshing={!!app.catalogueLoading}
      ListHeaderComponent={<View style={{ gap: 6 }}>
        {!!products.length && <SectionTitle title="Your next fit" subtitle="Keep exploring · Scroll for more pieces" onPress={() => onBrowse()} />}
        {app.catalogueLoading && <View style={{ flexDirection: 'row', gap: 8, padding: 10 }}><ActivityIndicator accessibilityLabel="Loading catalogues" color={p.accent} /><Text accessibilityLiveRegion="polite" style={{ color: p.muted, fontSize: 13 }}>Loading your catalogues…</Text></View>}
        {!!app.catalogueError && <View style={{ gap: 4, padding: 10, backgroundColor: p.errorSurface, borderRadius: 12 }}><Text accessibilityRole="alert" style={{ color: p.error, fontSize: 13 }}>{app.catalogueError}</Text><Button label="Retry catalogues" onPress={() => { void app.reload(); }} /></View>}
      </View>}
      ListEmptyComponent={!app.catalogueLoading && !app.catalogueError ? <View style={{ padding: 12, gap: 8, backgroundColor: p.tint, borderRadius: 12 }}><Text style={[s.sectionTitle, { color: p.text }]}>Your style starts here</Text><Text style={{ color: p.muted, fontSize: 13, lineHeight: 19 }}>Enable a demo store to fill your home with pieces to explore.</Text><Button label="Manage demo stores" onPress={() => navigate({ name: 'stores' })} /></View> : undefined}
      ListFooterComponent={<View style={{ gap: 10 }}>
        {hasMore ? <View style={{ gap: 3 }}><Text accessibilityLiveRegion="polite" style={{ color: p.muted, fontSize: 12 }}>{count} of {products.length} loaded pieces</Text><Button secondary label={appending ? 'Showing more pieces…' : 'Show more pieces'} disabled={appending || app.catalogueLoading} onPress={loadMore} /></View> : !app.catalogueLoading && !!products.length ? <Text accessibilityLiveRegion="polite" style={{ color: p.muted, fontSize: 12, lineHeight: 18, paddingVertical: 8 }}>{app.catalogueError ? 'End of the available pieces. Retry to recover missing catalogues.' : app.brands.some(brand => brand.more) ? 'You’ve seen this loaded page. More products may exist, but this catalogue connection does not provide further pages.' : 'You’re all caught up with the loaded catalogue.'}</Text> : null}
    {!hasMore && !app.catalogueLoading && <>
    {!!collections.length && <View style={{ gap: 6 }}><SectionTitle title="Value picks" subtitle="Available demo starting prices" onPress={() => onBrowse({ sort: 'price' })} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail}>{collections.map((collection, index) => <Pressable key={`${collection.category}-${collection.currency}`} accessibilityRole="button" accessibilityLabel={`Shop ${collection.category} in ${collection.currency}, from ${money(collection.amount, collection.currency)}`} onPress={() => onBrowse({ category: collection.category, currency: collection.currency, sort: 'price' })} style={{ width: cardWidth, borderRadius: 17, backgroundColor: collectionColors[index % 4], padding: 10, gap: 7 }}><Photo uri={collection.image} label={collection.category} height={96} allowRetry={false} /><Text style={{ color: ink, fontWeight: '700', fontSize: 14 }}>{collection.category}</Text><Text style={{ color: ink, fontWeight: '700', fontSize: 16 }}>From {money(collection.amount, collection.currency)}</Text><Text style={{ color: '#33445B', fontSize: 12, lineHeight: 18 }}>{collection.count} {collection.count === 1 ? 'style' : 'styles'} to browse →</Text></Pressable>)}</ScrollView></View>}

    {children}

    {!!app.brands.length && <View style={{ gap: 4 }}><SectionTitle title="Discover brands" action="All stores" onPress={() => navigate({ name: 'brands' })} /><View style={{ gap: 1 }}>{app.brands.map(brand => <View key={brand.id} style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderColor: p.line }}><Pressable accessibilityRole="button" accessibilityLabel={`Browse ${brand.name}`} onPress={() => navigate({ name: 'brand', brandId: brand.id })} style={{ flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 }}><BrandMark id={brand.id} name={brand.name} size={26} /><View><Text style={{ color: p.text, fontWeight: '600', fontSize: 13 }}>{brand.name}</Text><Text style={{ color: p.muted, fontSize: 10 }}>{brand.products.length} demo styles</Text></View></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`${app.followed.includes(brand.id) ? 'Unfollow' : 'Follow'} ${brand.name}`} onPress={() => void app.toggleFollowed(brand.id)} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Icon name={app.followed.includes(brand.id) ? 'check' : 'plus'} size={18} color={p.accent} /></Pressable></View>)}</View></View>}

    </>}
    <Text style={{ color: p.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', paddingVertical: 8 }}>Fictional demo catalogue · Checkout stays on this device</Text>
      </View>}
    />
  </KeyboardAvoidingView>;
}
function HomeProductCard({ product, cardWidth, navigate }: { product: Product; cardWidth: number; navigate: (route: Route) => void }) {
  const p = usePalette();
  const view = () => navigate({ name: 'product', productId: product.id, brandId: product.brandId });
  const available = product.variants.some(variant => variant.available);
  return <View testID="home-product-card" style={{ width: cardWidth, minWidth: 0, gap: 5 }}>
    <View testID="home-product-image" style={{ borderRadius: 16, overflow: 'hidden', backgroundColor: p.tint }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`View ${product.name}`} onPress={view}>
        <Photo uri={product.image} label={product.name} height={Math.min(220, Math.max(148, cardWidth * 1.12))} allowRetry={false} />
      </Pressable>
      {!!product.category && <View testID="home-product-category" pointerEvents="none" style={{ position: 'absolute', top: 7, left: 7, maxWidth: cardWidth - 14, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, backgroundColor: '#FFFFFF' }}><Text numberOfLines={1} style={{ fontSize: 9, lineHeight: 12, fontWeight: '700', color: ink }}>{product.category}</Text></View>}
      <Pressable accessibilityRole="button" accessibilityLabel={`Try on ${product.name}`} accessibilityState={{ disabled: !product.image }} disabled={!product.image} onPress={() => navigate({ name: 'try-on', productId: product.id, brandId: product.brandId })} style={{ position: 'absolute', right: 4, bottom: 0, minHeight: 48, minWidth: 84, alignSelf: 'flex-start', alignItems: 'center', opacity: product.image ? 1 : .5, justifyContent: 'center' }}>
        <View style={{ minHeight: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: citrus, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Icon name="camera" size={13} color={ink} /><Text style={{ color: ink, fontWeight: '700', fontSize: 11, lineHeight: 16 }}>Try On</Text></View>
      </Pressable>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={`View ${product.name}, ${homePrice(product)}`} onPress={view} style={{ paddingHorizontal: 1, gap: 2, minHeight: 64 }}>
      <Text numberOfLines={2} style={{ color: p.text, fontSize: 12, lineHeight: 17 }}><Text style={{ fontWeight: '700' }}>{product.brandName} </Text>{product.name}</Text>
      <Text style={{ color: p.text, fontWeight: '800', fontSize: 14, lineHeight: 20 }}>{homePrice(product)}</Text>
      <Text style={{ color: available ? p.muted : p.error, fontSize: 10, lineHeight: 14 }}>{available ? 'Demo catalogue' : 'Unavailable in this catalogue'}</Text>
    </Pressable>
  </View>;
}

const s = StyleSheet.create({
  searchBlock: { gap: 8 },
  discoveryRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  searchToggle: { minWidth: 48, minHeight: 48, flexShrink: 0, paddingHorizontal: 0, paddingVertical: 0, borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  search: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingRight: 2, minHeight: 48, borderWidth: 1, borderRadius: 24 },
  smallControl: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  filterToggle: { width: 48, minHeight: 48, flexShrink: 0, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  clearSearch: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  suggestion: { minHeight: 55, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 17, lineHeight: 21, fontWeight: '800', letterSpacing: -.4 },
  sectionLink: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 4 },
  small: { fontSize: 10, lineHeight: 14 },
  category: { minWidth: 48, minHeight: 54, alignItems: 'center', gap: 3, paddingBottom: 5 },
  categoryCircle: { height: 34, width: 34, borderRadius: 11, overflow: 'hidden' },
  categoryLabel: { fontSize: 10, lineHeight: 13, fontWeight: '600', textAlign: 'center' },
  rail: { gap: 8, paddingBottom: 3 },
  productCard: { borderWidth: 1, borderRadius: 15, overflow: 'hidden' },
});
