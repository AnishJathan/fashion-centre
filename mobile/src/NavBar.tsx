import React, { useEffect, useState } from 'react';
import { Text } from "./Typography";
import { Animated, Platform, Pressable, View, useWindowDimensions } from "react-native";
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { metrics, motion, visibleBadgeCount } from './design';
import { useReducedMotion } from './Motion';
import { primaryNavigation } from './primaryNavigation';
import { activeTab, bottomNavFrame, type BottomTabName } from './shellPresentation';
import type { Route } from './navigation';
import { usePalette, useReducedTransparency } from './ui';

export function NavBar({ route, bagQuantity, onSelectTab, onTryOn, blurTarget }: {
  blurTarget: React.RefObject<React.ComponentRef<typeof View> | null>;
  route: Route;
  bagQuantity: number;
  onSelectTab: (name: BottomTabName) => void;
  onTryOn: () => void;
}) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const frame = bottomNavFrame(width, fontScale, insets);
  const current = activeTab(route.name);
  const reducedMotion = useReducedMotion();
  const [focused, setFocused] = useState<string | null>(null);
  const [selectionScale] = useState(() => new Animated.Value(1));
  const tabWidth = (frame.width - 16) / primaryNavigation.length;
  const targetX = tabWidth * primaryNavigation.findIndex(tab => tab.id === current);
  const [lensOffset] = useState(() => new Animated.Value(targetX));
  useEffect(() => {
    if (reducedMotion) {
      lensOffset.setValue(targetX);
      return;
    }
    const slide = Animated.spring(lensOffset, {
      toValue: targetX, stiffness: 280, damping: 28, mass: 0.85, useNativeDriver: true,
    });
    slide.start();
    return () => slide.stop();
  }, [lensOffset, reducedMotion, targetX]);
  const solidContrast = useReducedTransparency();

  useEffect(() => {
    if (reducedMotion) {
      selectionScale.setValue(1);
      return;
    }
    selectionScale.setValue(0.88);
    const animation = Animated.timing(selectionScale, { toValue: 1, duration: motion.press * 3, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [current, reducedMotion, selectionScale]);

  return (
    <View testID="bottom-nav-safe-area" pointerEvents="box-none" style={{
      paddingLeft: frame.left, paddingRight: frame.right, paddingBottom: frame.bottom, alignItems: 'center',
    }}>
      <View testID="curved-bottom-nav" accessibilityRole="tablist" accessibilityLabel="Main navigation" style={{
        width: frame.width, height: frame.height, flexDirection: 'row', alignItems: 'stretch',
        paddingHorizontal: 7, paddingVertical: 3, borderRadius: metrics.pillRadius, borderWidth: 1,
        backgroundColor: solidContrast ? p.dock : 'transparent', borderColor: solidContrast ? p.dockText : 'transparent', borderTopWidth: 0,
        shadowColor: '#211810', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
      }}>
        {!solidContrast && <View pointerEvents="none" accessible={false} style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: metrics.pillRadius }}>
          {Platform.OS === 'ios' && isLiquidGlassAvailable()
            ? <GlassView glassEffectStyle="regular" colorScheme="dark" style={{ position: 'absolute', inset: 0, borderRadius: metrics.pillRadius }}/>
            : <BlurView intensity={64} tint="dark" blurMethod="dimezisBlurViewSdk31Plus" blurTarget={blurTarget}
                style={{ position: 'absolute', inset: 0 }}/>}
          <View style={{ position: 'absolute', inset: 0, backgroundColor: p.dock + 'AA' }}/>
          <Svg width="100%" height="100%" accessible={false}>
            <Defs><LinearGradient id="glass" x1="0%" y1="0%" x2="20%" y2="100%">
              <Stop offset="0" stopColor="#fff4dd" stopOpacity={0.24}/>
              <Stop offset="0.43" stopColor="#fff4dd" stopOpacity={0.025}/>
              <Stop offset="1" stopColor="#150e09" stopOpacity={0.12}/>
            </LinearGradient></Defs>
            <Rect width="100%" height="100%" rx={frame.height / 2} fill="url(#glass)"/>
          </Svg>
        </View>}
        {!solidContrast && <Animated.View testID="bottom-selection-lens" pointerEvents="none" style={{
          position: 'absolute', left: 8, top: 5, bottom: 5, width: tabWidth, overflow: 'hidden', borderRadius: metrics.pillRadius,
          backgroundColor: p.dockSelected + '38',
          transform: [{ translateX: lensOffset }],
        }}>
          <Svg width="100%" height="100%" accessible={false}>
            <Defs><LinearGradient id="lens" x1="0%" y1="80%" x2="100%" y2="20%">
              <Stop offset="0" stopColor="#fff2dc" stopOpacity={0.19}/>
              <Stop offset="0.46" stopColor="#fff2dc" stopOpacity={0}/>
              <Stop offset="1" stopColor="#fff2dc" stopOpacity={0.22}/>
            </LinearGradient></Defs>
            <Rect width="100%" height="100%" fill="url(#lens)"/>
          </Svg>
        </Animated.View>}
        {primaryNavigation.map(({ id, label, path }) => {
          const selected = current === id;
          const count = id === 'cart' ? bagQuantity : 0;
          const accessibleLabel = id === 'home' && route.brandId ? 'Discover, current store collection' : label;
          return (
            <Pressable key={id} testID={id === 'prepare' ? 'bottom-try-on' : 'bottom-tab-' + id}
              accessibilityRole="tab" accessibilityState={{ selected }}
              accessibilityLabel={count > 0 ? accessibleLabel + ', ' + count + (count === 1 ? ' piece' : ' pieces') : accessibleLabel}
              accessibilityHint={id === 'prepare' ? 'Open the try-on studio and choose a garment.' : undefined}
              onFocus={() => setFocused(id)} onBlur={() => setFocused(null)}
              onPress={id === 'prepare' ? onTryOn : () => onSelectTab(id)}
              style={({ pressed }) => ({
                flex: 1, minWidth: metrics.touch, minHeight: metrics.touch, gap: 2,
                alignItems: 'center', justifyContent: 'center', borderRadius: metrics.pillRadius,
                borderWidth: 2, borderColor: focused === id ? p.dockSelected : 'transparent',
                opacity: pressed ? 0.78 : 1,
                transform: [{ scale: pressed && !reducedMotion ? 0.96 : 1 }],
              })}>
              <Animated.View testID={selected ? 'bottom-active-capsule' : undefined} style={{
                width: 44, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: metrics.pillRadius,
                backgroundColor: selected && solidContrast ? p.dockSelected : 'transparent',
                transform: selected && !reducedMotion ? [
                  { scaleX: selectionScale.interpolate({inputRange: [.88, .95, 1], outputRange: [.82, 1.09, 1]}) },
                  { scaleY: selectionScale.interpolate({inputRange: [.88, .95, 1], outputRange: [1.09, .94, 1]}) },
                ] : [],
              }}>
                <Svg accessible={false} focusable={false} width={22} height={22} viewBox="0 0 24 24">
                  <Path d={path} fill="none" stroke={selected ? (solidContrast ? p.dockSelectedInk : p.dockSelected) : p.dockText}
                    strokeWidth={selected ? 1.9 : 1.7} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
                {count > 0 && <View accessible={false} style={{
                  position: 'absolute', top: -3, right: -4, minWidth: 16, paddingHorizontal: 3,
                  borderWidth: 1, borderColor: p.dock, borderRadius: metrics.pillRadius, backgroundColor: p.dockSelected,
                }}>
                  <Text allowFontScaling={false} style={{ textAlign: 'center', fontWeight: '700', fontSize: 9, lineHeight: 13, color: p.dockSelectedInk }}>{visibleBadgeCount(count)}</Text>
                </View>}
              </Animated.View>
              <Text numberOfLines={frame.labelLines} maxFontSizeMultiplier={2} adjustsFontSizeToFit minimumFontScale={0.8} style={{
                textAlign: 'center', color: selected ? p.dockSelected : p.dockText,
                fontSize: 11, lineHeight: 15, fontWeight: selected ? '700' : '500', includeFontPadding: false,
              }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
