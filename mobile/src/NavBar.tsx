import React, { useEffect, useState } from 'react';
import { Animated, Pressable, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { metrics, motion, visibleBadgeCount } from './design';
import { useReducedMotion } from './Motion';
import { primaryNavigation } from './primaryNavigation';
import { activeTab, bottomNavFrame, type BottomTabName } from './shellPresentation';
import type { Route } from './navigation';
import { usePalette, useReducedTransparency } from './ui';

export function NavBar({ route, bagQuantity, onSelectTab, onTryOn }: {
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
  const solidContrast = useReducedTransparency();

  useEffect(() => {
    if (reducedMotion) {
      selectionScale.setValue(1);
      return;
    }
    selectionScale.setValue(0.88);
    const animation = Animated.timing(selectionScale, { toValue: 1, duration: motion.press, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [current, reducedMotion, selectionScale]);

  return (
    <View testID="bottom-nav-safe-area" pointerEvents="box-none" style={{
      paddingLeft: frame.left, paddingRight: frame.right, paddingBottom: frame.bottom, alignItems: 'center',
    }}>
      <View testID="curved-bottom-nav" accessibilityRole="tablist" accessibilityLabel="Main navigation" style={{
        width: frame.width, height: frame.height, flexDirection: 'row', alignItems: 'stretch',
        paddingHorizontal: 7, paddingVertical: 3, borderRadius: metrics.controlRadius, borderWidth: 1,
        backgroundColor: p.dock, borderColor: solidContrast ? p.dockText : p.dockLine,
        shadowColor: '#211810', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
      }}>
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
                alignItems: 'center', justifyContent: 'center', borderRadius: metrics.controlRadius,
                borderWidth: 2, borderColor: focused === id ? p.dockSelected : 'transparent',
                opacity: pressed ? 0.78 : 1,
                transform: [{ scale: pressed && !reducedMotion ? 0.96 : 1 }],
              })}>
              <Animated.View testID={selected ? 'bottom-active-capsule' : undefined} style={{
                width: 44, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: metrics.controlRadius,
                backgroundColor: selected ? p.dockSelected : 'transparent',
                transform: [{ scale: selected ? selectionScale : 1 }],
              }}>
                <Svg accessible={false} focusable={false} width={22} height={22} viewBox="0 0 24 24">
                  <Path d={path} fill="none" stroke={selected ? p.dockSelectedInk : p.dockText}
                    strokeWidth={selected ? 1.9 : 1.7} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
                {count > 0 && <View accessible={false} style={{
                  position: 'absolute', top: -3, right: -4, minWidth: 16, paddingHorizontal: 3,
                  borderWidth: 1, borderColor: p.dock, borderRadius: metrics.controlRadius, backgroundColor: p.dockSelected,
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
