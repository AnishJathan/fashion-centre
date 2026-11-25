import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, TextInput } from "./Typography";
import { AccessibilityInfo, ActivityIndicator, BackHandler, FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, findNodeHandle, useWindowDimensions } from "react-native";
import { useFocusEffect } from '@react-navigation/native';
import { EditorialCover } from './EditorialCover';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { displayFont, metrics, pageLayout } from './design';
import { shoppingGridLayout } from './shoppingLayout';
import { HOME_FEED_BATCH, homeFeedRows, homeProductKey, uniqueHomeProducts } from './homeFeed';
import { useApp } from './state';
import { storeThumbnail } from './storeThumbnail';
import { BrandMark } from './BrandMark';
import { FollowedBrandRail } from './FollowedBrandRail';
import { Button, Icon, Photo, useDockInset, usePalette } from './ui';
import { money, type Product } from './core/domain';
import type { Route } from './navigation';
import { homeCategories, homePrice, homeSuggestions, homeValueCollections, type BrowseSelection } from './commerceHome.ts';

export function CommerceHome({ navigate, onBrowse, children }: {
  navigate: (route: Route) => void; onBrowse: (selection?: BrowseSelection) => void; children?: React.ReactNode;
}) {
  const dockInset = useDockInset();
  const app = useApp(), p = usePalette(), window = useWindowDimensions();
  const insets = useSafeAreaInsets(), headerHeight = useHeaderHeight();
  const [viewportWidth, setViewportWidth] = useState(window.width);
  const layout = pageLayout(viewportWidth, window.fontScale, insets);
  const hasStores = app.brands.some(brand=>brand.id.startsWith("shop-") || app.sources?.some(source=>source.key===brand.id && source.preview)) || app.registrations.some(store => store.enabled);
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
  const [pageWidth, setPageWidth] = useState(layout.contentWidth);
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
  function SectionTitle({ title, subtitle, action = 'See all', onPress }: { title: string; subtitle?: string; action?: string; onPress: () => void }) {
    return <View style={s.sectionHeader}><View style={{ flex: 1, gap: 3 }}><Text accessibilityRole="header" style={[s.sectionTitle, { color: p.text }]}>{title}</Text>{subtitle ? <Text style={[s.small, { color: p.muted }]}>{subtitle}</Text> : null}</View><Pressable accessibilityRole="button" onPress={onPress} style={s.sectionLink} hitSlop={{ top: 4, bottom: 4 }}><Text style={{ fontWeight: '700', color: p.accent, fontSize: 13 }}>{action}</Text><Icon name="arrow-right" color={p.accent} size={17} /></Pressable></View>;
  }
  const discoveryControls = (
    <View testID="home-browse-controls" onLayout={event => setPageWidth(event.nativeEvent.layout.width)}
      style={{ gap: metrics.gap, paddingBottom: metrics.gap, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.line }}>

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
          style={[s.searchToggle, { backgroundColor: p.surface, borderColor: p.line }, searchOpen ? { width: metrics.touch } : { flex: 1, paddingHorizontal: metrics.gap }]}
        >
          <Icon name={searchOpen ? 'arrow-left' : 'search'} color={p.accent} size={19} />
          {!searchOpen && <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: query.trim() ? p.text : p.muted, fontSize: 14 }}>{query.trim() || 'Search the catalogue'}</Text>}
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
        </View> : null}
        {!searchOpen && <Pressable
          testID="home-filter-toggle"
          accessibilityRole="button"
          accessibilityLabel="Filters & sort"
          accessibilityHint="Open catalogue filters for category, store and sort order."
          onPress={() => onBrowse({ showFilters: true, ...(query.trim() ? { query: query.trim() } : {}) })}
          style={[s.filterToggle, { borderColor: p.line, backgroundColor: p.surface }]}
        ><Icon name="sliders" size={19} color={p.accent} /></Pressable>}
      </View>
      {!searchOpen && <ScrollView horizontal testID="home-category-shortcuts" accessibilityLabel="Shop by category"
        showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        style={{ minWidth: 0, flexGrow: 0 }} contentContainerStyle={{ gap: metrics.compactGap, alignItems: 'center' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Shop all" onPress={() => onBrowse()}
          style={[s.category, { maxWidth: pageWidth, borderColor: p.accent, backgroundColor: p.accent }]}>
          <Icon name="grid" size={16} color={p.onAccent} />
          <Text style={[s.categoryLabel, { color: p.onAccent }]}>Shop all</Text>
        </Pressable>
        {categories.map(group => (
          <Pressable key={group.category} accessibilityRole="button" accessibilityLabel={group.category}
            accessibilityHint={`Browse ${group.category} in the catalogue.`} onPress={() => onBrowse({ category: group.category })}
            style={[s.category, { maxWidth: pageWidth, borderColor: p.line, backgroundColor: p.surface }]}>
            {!!group.image && <View style={s.categoryPhoto}><Photo embedded uri={group.image} label={group.category} height={24} allowRetry={false} /></View>}
            <Text style={[s.categoryLabel, { color: p.text }]}>{group.category}</Text>
          </Pressable>
        ))}
      </ScrollView>}
      {searchOpen && query.trim() ? <ScrollView testID="home-search-suggestions" keyboardShouldPersistTaps="handled" style={{ maxHeight: Math.min(220, window.height * .28), backgroundColor: p.surface, borderRadius: metrics.cardRadius }} contentContainerStyle={{ padding: 6 }}>
        {suggestions.map(product => <Pressable key={product.id} accessibilityRole="button" accessibilityLabel={`View ${product.name}, ${product.brandName}, ${product.category}`} onPress={() => view(product)} style={s.suggestion}><Icon name="search" size={16} color={p.muted} /><View style={{ flex: 1 }}><Text style={{ color: p.text, fontSize: 14, fontWeight: '600' }}>{product.name}</Text><Text style={[s.small, { color: p.muted }]}>{product.brandName} · {product.category}</Text></View><Icon name="arrow-up-right" size={17} color={p.accent} /></Pressable>)}
        {!suggestions.length && <Text style={{ padding: 12, color: p.muted }}>No matching items in the loaded catalogue.</Text>}
        <Button label={`Search for “${query.trim()}”`} onPress={submitSearch} />
      </ScrollView> : null}
    </View>
    </View>
  );
  return <KeyboardAvoidingView testID="home-feed-screen" onLayout={event => setViewportWidth(event.nativeEvent.layout.width)} style={{ flex: 1, minWidth: 0, backgroundColor: p.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
    <FlatList
      testID="home-product-feed"
      data={rows}
      keyExtractor={row => row.key}
      renderItem={({ item }) => <View style={{ flexDirection: 'row', gap: grid.gap, paddingBottom: 14 }}>{item.products.map(product => <HomeProductCard key={homeProductKey(product)} product={product} cardWidth={grid.cardWidth} navigate={navigate} />)}</View>}
      style={{ flex: 1, minWidth: 0 }}
      contentContainerStyle={[contentStyle, { paddingTop: metrics.gap, paddingBottom: dockInset + metrics.sectionGap }]}
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
      ListHeaderComponent={<View style={{ gap: metrics.gap, paddingBottom: metrics.compactGap }}>

        {hasStores ? discoveryControls : <View style={{ gap: metrics.compactGap }}>
          {([{ name: 'brands', label: 'Browse stores' }, { name: 'prepare', label: 'Try-on studio' }, { name: 'login', label: 'Your account' }] as const).map(item =>
            <Pressable key={item.name} accessibilityRole="button" onPress={() => navigate({ name: item.name })} style={({ pressed }) => ({ minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: metrics.gap, borderWidth: 1, borderColor: p.line, borderRadius: metrics.cardRadius, backgroundColor: pressed ? p.tint : p.surface })}>
              <Text style={{ fontFamily: displayFont, fontSize: 19, color: p.text }}>{item.label}</Text><Icon name="arrow-up-right" color={p.accent} size={18} />
            </Pressable>)}
        </View>}
        {!!app.brands.length && !searchOpen && <View style={{ gap: metrics.compactGap }}>
          <SectionTitle title="Shop by stores" action="All stores" onPress={() => navigate({ name: 'brands' })} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: metrics.compactGap}}>
            {app.brands.map(store => <View key={store.id} style={{width: Math.max(144, Math.min(220, viewportWidth * .44)), borderRadius: metrics.insetRadius, borderWidth: 1, borderColor: p.line, backgroundColor: p.surface, overflow: 'hidden'}}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Browse ${store.name}`} onPress={() => navigate({name:'brand', brandId:store.id})} style={({pressed}) => ({opacity:pressed ? .78 : 1})}>
                {store.image ? <Photo embedded uri={storeThumbnail(store.image)} label="" height={76} allowRetry={false}/> : <View style={{height:76,alignItems:"center",justifyContent:"center",backgroundColor:p.tint}}><BrandMark id={store.id} name={store.name} size={26}/></View>}
                <View style={{padding: 10, gap: 3}}>
                  <Text style={{color:p.text, fontFamily:displayFont, fontSize:18}}>{store.name}</Text>
                  <Text style={{color:p.accent, fontSize:12, fontWeight:'600'}}>{store.products.length} pieces  →</Text>
                </View>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`${app.followed.includes(store.id) ? 'Unfollow' : 'Follow'} ${store.name}`} accessibilityState={{selected:app.followed.includes(store.id)}} onPress={() => void app.toggleFollowed(store.id)} style={{minHeight:44, justifyContent:'center',paddingHorizontal:10,borderTopWidth:1,borderColor:p.line}}>
                <Text style={{color:p.muted,fontWeight:'600'}}>{app.followed.includes(store.id) ? '✓ Following' : '+ Follow'}</Text>
              </Pressable>
            </View>)}
          </ScrollView>
        </View>}
        {!searchOpen && <EditorialCover hasStores={hasStores} openCollection={() => hasStores ? onBrowse() : navigate({ name: 'stores' })} />}
        {!searchOpen && <FollowedBrandRail navigate={navigate} />}
        {!!products.length && <SectionTitle title="Your next fit" subtitle="Keep exploring · Scroll for more pieces" onPress={() => onBrowse()} />}
        {app.catalogueLoading && <View style={{ flexDirection: 'row', gap: 8, padding: 10 }}><ActivityIndicator accessibilityLabel="Loading catalogues" color={p.accent} /><Text accessibilityLiveRegion="polite" style={{ color: p.muted, fontSize: 13 }}>Loading your catalogues…</Text></View>}
        {!!app.catalogueError && <View style={{ gap: 4, padding: 10, backgroundColor: p.errorSurface, borderRadius: metrics.cardRadius }}><Text accessibilityRole="alert" style={{ color: p.error, fontSize: 13 }}>{app.catalogueError}</Text><Button label="Retry catalogues" onPress={() => { void app.reload(); }} /></View>}
      </View>}
      ListEmptyComponent={!app.catalogueLoading && !app.catalogueError && products.length === 0 && app.brands.length > 0 ?
        <Text style={{ color: p.muted }}>No products in your enabled catalogues.</Text> : undefined}
      ListFooterComponent={<View style={{ gap: 10 }}>
        {hasMore ? <View style={{ gap: 3 }}><Text accessibilityLiveRegion="polite" style={{ color: p.muted, fontSize: 12 }}>{count} of {products.length} loaded pieces</Text><Button secondary label={appending ? 'Showing more pieces…' : 'Show more pieces'} disabled={appending || app.catalogueLoading} onPress={loadMore} /></View> : !app.catalogueLoading && !!products.length ? <Text accessibilityLiveRegion="polite" style={{ color: p.muted, fontSize: 12, lineHeight: 18, paddingVertical: 8 }}>{app.catalogueError ? 'End of the available pieces. Retry to recover missing catalogues.' : app.brands.some(brand => brand.more) ? 'You’ve seen this loaded page. More products may exist, but this catalogue connection does not provide further pages.' : 'You’re all caught up with the loaded catalogue.'}</Text> : null}
    {!hasMore && !app.catalogueLoading && <>
    {!!collections.length && <View style={{ gap: 6 }}><SectionTitle title="Value picks" subtitle="Available demo starting prices" onPress={() => onBrowse({ sort: 'price' })} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail}>{collections.map(collection => <Pressable key={`${collection.category}-${collection.currency}`} accessibilityRole="button" accessibilityLabel={`Shop ${collection.category} in ${collection.currency}, from ${money(collection.amount, collection.currency)}`} onPress={() => onBrowse({ category: collection.category, currency: collection.currency, sort: 'price' })} style={{ width: cardWidth, borderRadius: metrics.cardRadius, backgroundColor: p.tint, overflow: 'hidden' }}><Photo embedded uri={collection.image} label={collection.category} height={96} allowRetry={false} /><View style={{padding: 10, gap: 7}}><Text style={{ color: p.text, fontWeight: '700', fontSize: 14 }}>{collection.category}</Text><Text style={{ color: p.text, fontWeight: '700', fontSize: 16 }}>From {money(collection.amount, collection.currency)}</Text><Text style={{ color: p.muted, fontSize: 12, lineHeight: 18 }}>{collection.count} {collection.count === 1 ? 'style' : 'styles'} to browse →</Text></View></Pressable>)}</ScrollView></View>}

    {children}



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
    <View testID="home-product-image" style={{ borderRadius: metrics.cardRadius, overflow: 'hidden', backgroundColor: p.tint }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`View ${product.name}`} onPress={view}>
        <Photo embedded uri={product.image} label={product.name} height={Math.min(220, Math.max(148, cardWidth * 1.12))} allowRetry={false} />
      </Pressable>
      {!!product.category && <View testID="home-product-category" pointerEvents="none" style={{ position: 'absolute', top: 7, left: 7, maxWidth: cardWidth - 14, paddingHorizontal: 7, paddingVertical: 3, borderRadius: metrics.cardRadius, backgroundColor: p.surface }}><Text numberOfLines={1} style={{ fontSize: 9, lineHeight: 12, fontWeight: '700', color: p.text }}>{product.category}</Text></View>}
      <Pressable accessibilityRole="button" accessibilityLabel={`Try on ${product.name}`} accessibilityState={{ disabled: !product.image }} disabled={!product.image} onPress={() => navigate({ name: 'try-on', productId: product.id, brandId: product.brandId })} style={{ position: 'absolute', right: 4, bottom: 0, minHeight: 48, minWidth: 84, alignSelf: 'flex-start', alignItems: 'center', opacity: product.image ? 1 : .5, justifyContent: 'center' }}>
        <View style={{ minHeight: 28, paddingHorizontal: 10, borderRadius: metrics.cardRadius, backgroundColor: p.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Icon name="camera" size={13} color={p.onAccent} /><Text style={{ color: p.onAccent, fontWeight: '700', fontSize: 11, lineHeight: 16 }}>Try On</Text></View>
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
  searchBlock: { gap: metrics.compactGap },
  discoveryRow: { flexDirection: 'row', alignItems: 'center', gap: metrics.compactGap, minWidth: 0 },
  searchToggle: { minWidth: metrics.touch, minHeight: metrics.touch, paddingVertical: 6, borderWidth: 1, borderRadius: metrics.controlRadius, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: metrics.compactGap },
  search: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingRight: 2, minHeight: 48, borderWidth: 1, borderRadius: metrics.cardRadius },
  filterToggle: { width: metrics.touch, minHeight: metrics.touch, flexShrink: 0, borderWidth: 1, borderRadius: metrics.controlRadius, alignItems: 'center', justifyContent: 'center' },
  clearSearch: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  suggestion: { minHeight: 55, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 23, lineHeight: 28, fontFamily: displayFont, letterSpacing: -.4 },
  sectionLink: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 4 },
  small: { fontSize: 10, lineHeight: 14 },
  category: { minWidth: metrics.touch, minHeight: metrics.touch, paddingVertical: 6, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: metrics.compactGap, borderWidth: 1, borderRadius: metrics.controlRadius },
  categoryPhoto: { height: 24, width: 24, borderRadius: 12, overflow: 'hidden' },
  categoryLabel: { flexShrink: 1, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  rail: { gap: 8, paddingBottom: 3 },
});
