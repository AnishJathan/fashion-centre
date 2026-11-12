import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useApp } from './state';
import { Icon, usePalette } from './ui';
import { BrandRailBadge } from './BrandRailBadge';
import { brandExperience } from './brandExperience';
import { followedBrands, nextBrandOffset } from './followedBrands';
import type { Route } from './navigation';

export function FollowedBrandRail({ navigate }: { navigate: (route: Route) => void }) {
  const app = useApp(), p = usePalette(), focused = useIsFocused();
  const { fontScale } = useWindowDimensions();
  const brands = followedBrands(app.brands, app.followed);
  const rail = useRef<React.ElementRef<typeof ScrollView>>(null), offset = useRef(0);
  const [width, setWidth] = useState(0), [content, setContent] = useState(0);
  const [paused, setPaused] = useState(false), [reduceMotion, setReduceMotion] = useState(true);
  const [screenReader, setScreenReader] = useState(true), [active, setActive] = useState(AppState.currentState === 'active');
  const [focusedEntry, setFocusedEntry] = useState<string | null>(null);
  // Story-like links stay compact rather than stretching into store cards.
  // Labels can grow vertically and the rail remains scrollable at large text sizes.
  const scale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  const entryWidth = 64 + Math.min(48, (scale - 1) * 40);
  const trackMaxWidth = brands.length * entryWidth + Math.max(0, brands.length - 1) * 6;
  const focusEntry = (id: string) => { setPaused(true); setFocusedEntry(id); };
  const max = Math.max(0, content - width), canMove = max > 1 && brands.length > 1;
  const running = canMove && !paused && !reduceMotion && !screenReader && active && focused;
  useEffect(() => {
    let live = true, motionChanged = false, readerChanged = false;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (live && !motionChanged) setReduceMotion(value); }).catch(() => {});
    void AccessibilityInfo.isScreenReaderEnabled().then(value => { if (live && !readerChanged) setScreenReader(value); }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { motionChanged = true; setReduceMotion(value); });
    const reader = AccessibilityInfo.addEventListener('screenReaderChanged', value => { readerChanged = true; setScreenReader(value); });
    const state = AppState.addEventListener('change', value => setActive(value === 'active'));
    return () => { live = false; motion.remove(); reader.remove(); state.remove(); };
  }, []);
  useEffect(() => {
    offset.current = Math.min(offset.current, max);
    rail.current?.scrollTo({ x: offset.current, animated: false });
  }, [max, brands.map(brand => brand.id).join('|')]);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      const next = nextBrandOffset(offset.current, max);
      const wraps = offset.current <= .5;
      offset.current = next;
      rail.current?.scrollTo({ x: next, animated: !wraps });
    }, 3500);
    return () => clearInterval(timer);
  }, [running, max]);
  const move = (direction: -1 | 1) => {
    setPaused(true);
    offset.current = Math.max(0, Math.min(max, offset.current + direction * 116));
    rail.current?.scrollTo({ x: offset.current, animated: !reduceMotion });
  };
  return <View style={{ gap: 0 }} accessibilityLabel="Brands you follow">
    {brands.length ? <>
      <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 6, minWidth: 0 }}>
        <ScrollView ref={rail} horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, minWidth: 0, maxWidth: trackMaxWidth }} onLayout={e => setWidth(e.nativeEvent.layout.width)} onContentSizeChange={setContent} onScroll={e => { offset.current = e.nativeEvent.contentOffset.x; }} scrollEventThrottle={16} onScrollBeginDrag={() => setPaused(true)} onTouchStart={() => setPaused(true)} contentContainerStyle={{ gap: 6, alignItems: 'stretch' }}>
          {brands.map(brand => {
            const identity = brandExperience(brand.id, app.theme), colors = identity.palette;
            return <Pressable key={brand.id} accessibilityRole="button" accessibilityLabel={`Open ${brand.name} storefront`} onFocus={() => focusEntry(brand.id)} onBlur={() => setFocusedEntry(null)} onPress={() => { setPaused(true); navigate({ name: 'brand', brandId: brand.id }); }} style={({ pressed }) => ({ width: entryWidth, minHeight: 64, flexDirection: 'column', alignItems: 'center', gap: 2, paddingHorizontal: 2, borderRadius: 9, borderWidth: 1, borderColor: focusedEntry === brand.id ? colors.accent : 'transparent', backgroundColor: pressed ? colors.tint : 'transparent', opacity: pressed ? .78 : 1 })}>
              <BrandRailBadge id={brand.id} name={brand.name} theme={app.theme} />
              <Text numberOfLines={scale >= 1.3 ? undefined : 2} style={{ alignSelf: 'stretch', minHeight: 26, textAlign: 'center', includeFontPadding: false, fontFamily: identity.serif ? Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }) : undefined, fontSize: 11, lineHeight: 13, fontWeight: identity.serif ? '600' : '700', letterSpacing: -.15, color: colors.text }}>{brand.name}</Text>
            </Pressable>;
          })}
        </ScrollView>
        <Pressable accessibilityRole="button" accessibilityLabel="Discover brands to follow" onFocus={() => focusEntry('discover')} onBlur={() => setFocusedEntry(null)} onPress={() => { setPaused(true); navigate({ name: 'brands' }); }} style={({ pressed }) => ({ width: 56 * Math.min(scale, 1.6), minHeight: 64, paddingHorizontal: 2, borderRadius: 9, borderWidth: 1, borderColor: focusedEntry === 'discover' ? p.text : 'transparent', backgroundColor: pressed ? p.tint : 'transparent', alignItems: 'center', gap: 2, opacity: pressed ? .76 : 1 })}>
          <View accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: p.accent, backgroundColor: p.background, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: p.accent, alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" size={16} color={p.onAccent} /></View></View>
          <Text style={{ alignSelf: 'stretch', minHeight: 26, textAlign: 'center', includeFontPadding: false, fontSize: 11, lineHeight: 13, fontWeight: '700', letterSpacing: -.2, color: p.text }}>Discover</Text>
        </Pressable>
      </View>
      {canMove && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Pressable accessibilityRole="button" accessibilityLabel="Previous followed brands" onFocus={() => setPaused(true)} onPress={() => move(-1)} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Icon name="chevron-left" color={p.accent} size={16} /></Pressable><Text style={{ flex: 1, textAlign: 'center', color: p.muted, fontSize: 10 }}>{running ? 'Moving left to right' : 'Your followed brands'}</Text>{!reduceMotion && !screenReader && <Pressable accessibilityRole="button" accessibilityLabel={paused ? 'Play followed brand banner' : 'Pause followed brand banner'} onPress={() => setPaused(!paused)} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Icon name={paused ? 'play' : 'pause'} color={p.accent} size={16} /></Pressable>}<Pressable accessibilityRole="button" accessibilityLabel="Next followed brands" onFocus={() => setPaused(true)} onPress={() => move(1)} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Icon name="chevron-right" color={p.accent} size={16} /></Pressable></View>}
    </> : <Pressable accessibilityRole="button" accessibilityLabel="Find brands to follow" onPress={() => navigate({ name: 'brands' })} style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 13, borderWidth: 1, borderColor: p.line, backgroundColor: p.tint, flexDirection: 'row', alignItems: 'center', gap: 9, opacity: pressed ? .76 : 1 })}><Icon name="grid" color={p.accent} size={18} /><Text style={{ flex: 1, color: p.text, fontSize: 12, lineHeight: 17, fontWeight: '600' }}>{app.followed.length ? 'Followed stores unavailable · Discover more' : 'Follow your favourite brands'}</Text><Icon name="arrow-up-right" color={p.accent} size={17} /></Pressable>}
  </View>;
}
