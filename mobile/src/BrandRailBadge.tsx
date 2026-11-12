import React from 'react';
import { Platform, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { brandExperience } from './brandExperience';

/** Original local monograms. The decorative ring does not represent unseen stories. */
export function BrandRailBadge({ id, name, theme }: { id: string; name: string; theme: 'light' | 'dark' }) {
  const { identity, palette: p, serif } = brandExperience(id, theme);
  const initials = name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0] || '').join('').toLocaleUpperCase();
  return <View accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 17, borderWidth: 1, borderColor: p.accent, alignItems: 'center', justifyContent: 'center', backgroundColor: p.background }}>
    <View style={{ width: 26, height: 26, borderRadius: 13, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: p.accent }}>
      <Svg width={26} height={26} viewBox="0 0 30 30" accessible={false} focusable={false} style={{ position: 'absolute' }}>
        {identity === 'atelier' ? <>
          <Circle cx={15} cy={15} r={11.5} stroke={p.onAccent} strokeOpacity={.38} strokeWidth={.6} fill="none" />
          <Path d="M12 5.5h6M12 24.5h6" stroke={p.onAccent} strokeOpacity={.7} strokeWidth={.8} />
        </> : identity === 'everyday' ? <>
          <Circle cx={28} cy={0} r={16} fill={p.onAccent} fillOpacity={.14} />
          <Circle cx={2} cy={30} r={12} fill={p.onAccent} fillOpacity={.1} />
          <Path d="M22 4.5v5M19.5 7h5" stroke={p.onAccent} strokeOpacity={.45} strokeWidth={1} />
        </> : identity === 'studio' ? <>
          <Path d="M15 0 30 15M21 0l9 9M0 23l7 7" stroke={p.onAccent} strokeOpacity={.24} strokeWidth={2} />
          <Path d="M3 8V3h5M22 27h5v-5" stroke={p.onAccent} strokeOpacity={.6} strokeWidth={1} fill="none" />
        </> : <>
          <Path d="M11 30V17a15 15 0 0 1 30 0M16 30V17a10 10 0 0 1 20 0M21 30V17a5 5 0 0 1 10 0" stroke={p.onAccent} strokeOpacity={.24} strokeWidth={1.2} fill="none" />
          <Circle cx={6} cy={6} r={1} fill={p.onAccent} fillOpacity={.6} />
        </>}
      </Svg>
      <Text allowFontScaling={false} style={{ fontFamily: serif ? Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }) : undefined, fontSize: serif ? 13 : 11, lineHeight: 17, fontWeight: serif ? '500' : '800', letterSpacing: serif ? -.7 : -.4, color: p.onAccent }}>{initials}</Text>
    </View>
  </View>;
}
