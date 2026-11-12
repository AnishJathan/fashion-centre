import React from 'react';
import { Text, View } from 'react-native';
import { brandExperience } from './brandExperience';
import { useApp } from './state';

/** Small local monograms because the demo catalogue supplies no official logo assets. */
export function BrandMark({ id, name, size = 28 }: { id: string; name: string; size?: number }) {
  const identity = brandExperience(id, useApp().theme);
  const initials = name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0] || '').join('').toLocaleUpperCase();
  return <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', borderRadius: identity.serif ? 5 : size / 3, backgroundColor: identity.palette.accent }}><Text style={{ color: identity.palette.onAccent, fontSize: size * .38, fontWeight: '700', lineHeight: size * .5, letterSpacing: -.3 }} allowFontScaling={false}>{initials}</Text></View>;
}
