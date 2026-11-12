import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useApp } from './state';
import { brandExperience, brandProducts, type BrandSort } from './brandExperience';
import { type Brand, type Product } from './core/domain';
import type { Route } from './navigation';
import { Button, Icon, usePalette } from './ui';
import { ProductGrid, ShoppingEmpty } from './ShoppingComponents';

type Props = { brand: Brand; navigate: (route: Route) => void; scrollTo?: (y: number) => void };
/** The shell owns the small store mark/title. This surface starts with shopping. */
export function BrandStorefront({ brand, navigate, scrollTo }: Props) {
  const app = useApp(), p = usePalette(), window = useWindowDimensions();
  const identity = brandExperience(brand.id, app.theme);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [sort, setSort] = useState<BrandSort>('featured');
  const [showSort, setShowSort] = useState(false);
  const [tryOnOnly, setTryOnOnly] = useState(false);
  const scoped = brandProducts(app.products, brand.id);
  const categories = ['All', ...new Set(scoped.map(piece => piece.category).filter(Boolean))];
  const list = brandProducts(app.products, brand.id, query, category, sort, tryOnOnly);
  const following = app.followed.includes(brand.id);
  const fontFamily = identity.serif ? Platform.OS === 'ios' ? 'Georgia' : 'serif' : undefined;
  function reset() { setQuery(''); setCategory('All'); setSort('featured'); setTryOnOnly(false); }
  function open(piece: Product) { navigate({ name: 'product', productId: piece.id, brandId: brand.id }); }
  function tryOn(piece: Product) { navigate({ name: 'try-on', productId: piece.id, brandId: brand.id }); }
  // Small visible pills sit inside full-height touch targets; large text grows naturally.
  const target = { minHeight: 48, minWidth: 48, justifyContent: 'center' as const };
  const pill = (selected: boolean) => ({ paddingHorizontal: 10, paddingVertical: 6, borderRadius: Math.min(identity.radius, 12), backgroundColor: selected ? p.accent : p.surface, borderWidth: 1, borderColor: selected ? p.accent : p.line, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 5 });
  return <View testID="compact-storefront" style={{ gap: 4 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingLeft: 9, zIndex: 0 }}><View pointerEvents="none" style={{ position: 'absolute', zIndex: -1, top: 4, bottom: 4, left: 0, right: 0, backgroundColor: p.surface, borderWidth: 1, borderColor: p.controlLine, borderRadius: Math.min(identity.radius, 8) }} />
        <Icon name="search" size={16} color={p.muted} />
        <TextInput accessibilityLabel={`Search ${brand.name}`} value={query} onChangeText={setQuery} placeholder="Search this store" placeholderTextColor={p.muted} autoCapitalize="none" autoCorrect={false} returnKeyType="search" onSubmitEditing={() => setQuery(query.trim())} style={{ color: p.text, flex: 1, minWidth: 0, minHeight: 44, fontSize: 12, lineHeight: 17, paddingHorizontal: 6, paddingVertical: 0 }} />
        {!!query && <Pressable accessibilityRole="button" accessibilityLabel="Clear store search" onPress={() => setQuery('')} style={{ ...target, alignItems: 'center' }}><Icon name="x" color={p.muted} size={16} /></Pressable>}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${following ? 'Unfollow' : 'Follow'} ${brand.name}`} accessibilityState={{ selected: following }} onPress={() => { void app.toggleFollowed(brand.id); }} style={({ pressed }) => ({ ...target, alignItems: 'center', opacity: pressed ? .7 : 1 })}>
        <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: Math.min(identity.radius, 12), backgroundColor: following ? p.accent : p.tint }}><Icon name={following ? 'check' : 'plus'} size={17} color={following ? p.onAccent : p.accent} /></View>
      </Pressable>
    </View>

    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Collection" accessibilityState={{ selected: !tryOnOnly }} onPress={reset} style={target}><View style={pill(!tryOnOnly)}><Text style={{ color: !tryOnOnly ? p.onAccent : p.text, fontWeight: '700', fontSize: 12, lineHeight: 17 }}>Collection</Text></View></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Try on pieces from ${brand.name}`} accessibilityState={{ selected: tryOnOnly }} onPress={() => { setTryOnOnly(true); setQuery(''); setCategory('All'); scrollTo?.(0); }} style={target}><View style={pill(tryOnOnly)}><Icon name="camera" size={15} color={tryOnOnly ? p.onAccent : p.accent} /><Text style={{ color: tryOnOnly ? p.onAccent : p.text, fontWeight: '700', fontSize: 12, lineHeight: 17 }}>Try on</Text></View></Pressable>
    </View>

    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 5 }} accessibilityLabel={`${brand.name} categories`}>
        {categories.map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={value === 'All' ? 'All store categories' : `Shop ${value}`} accessibilityState={{ selected: category === value }} onPress={() => { setCategory(value); scrollTo?.(0); }} style={target}><View style={{ paddingHorizontal: 9, paddingVertical: 5, borderBottomWidth: category === value ? 2 : 0, borderColor: p.accent }}><Text style={{ color: category === value ? p.accent : p.muted, fontSize: 12, lineHeight: 17, fontWeight: category === value ? '700' : '500' }}>{value === 'All' ? 'All pieces' : value}</Text></View></Pressable>)}
      </ScrollView>
      <Pressable accessibilityRole="button" accessibilityLabel="Sort store collection" accessibilityState={{ expanded: showSort }} onPress={() => setShowSort(value => !value)} style={{ ...target, alignItems: 'center' }}><Icon name="sliders" size={17} color={p.accent} /></Pressable>
    </View>
    {showSort && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
      {([{ value: 'featured', label: 'Catalogue order' }, { value: 'name', label: 'Name A–Z' }, { value: 'price', label: 'Price ↑ · by currency' }] as const).map(option => <Pressable key={option.value} accessibilityRole="button" accessibilityLabel={option.label} accessibilityState={{ selected: sort === option.value }} onPress={() => { setSort(option.value); setShowSort(false); }} style={target}><View style={pill(sort === option.value)}><Text style={{ color: sort === option.value ? p.onAccent : p.text, fontSize: 12, lineHeight: 17 }}>{option.label}</Text></View></Pressable>)}
    </View>}
    <View style={{ flexDirection: window.fontScale >= 1.4 ? 'column' : 'row', justifyContent: 'space-between', alignItems: window.fontScale >= 1.4 ? 'flex-start' : 'baseline', gap: 4, paddingTop: 2, paddingBottom: 6 }}>
      <Text accessibilityRole="header" style={{ color: p.text, fontSize: 16, lineHeight: 22, fontWeight: '700', fontFamily, flexShrink: 1 }}>{tryOnOnly ? 'Choose a piece to try on' : query.trim() ? 'Search results' : category !== 'All' ? category : identity.collectionLabel}</Text>
      <Text accessibilityLiveRegion="polite" style={{ color: p.muted, fontSize: 12, lineHeight: 18 }}>{list.length} {list.length === 1 ? 'piece' : 'pieces'}</Text>
    </View>
    {tryOnOnly && <Text style={{ color: p.muted, fontSize: 12, lineHeight: 18, paddingBottom: 6 }}>Select Try on below a piece. Your saved photo and confirmation are required before any generation.</Text>}
    <ProductGrid products={list} onView={open} onTryOn={tryOn} />
    {!list.length && !app.catalogueLoading && <ShoppingEmpty title={scoped.length ? 'No matching pieces' : 'This collection is empty'} description={scoped.length ? 'Try another search or category within this store.' : 'No demo pieces are available here right now.'} action={scoped.length ? 'Reset store filters' : 'Manage demo stores'} onPress={scoped.length ? reset : () => navigate({ name: 'stores' })} />}
    {!!(query || category !== 'All' || sort !== 'featured' || tryOnOnly) && <Button secondary label="Reset store filters" onPress={reset} />}
    {brand.more && <Text style={{ color: p.muted, fontSize: 12, lineHeight: 18 }}>Showing up to 48 pieces from this demo store.</Text>}
    <Text style={{ color: p.muted, fontSize: 12, lineHeight: 18, paddingTop: 8 }}>Fictional demo store · Checkout stays on this device.</Text>
  </View>;
}
