import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { AppMark } from './BrandMark';
import { useReducedMotion } from './Motion';
import { useApp } from './state';
import { usePalette } from './ui';

/** Two fine elliptical threads turn into alignment around the house monogram. */
export function LaunchReveal({ fontsReady }: { fontsReady: boolean }) {
  const { ready, error } = useApp();
  const palette = usePalette();
  const reduced = useReducedMotion();
  const sweep = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (finished) return;
    const reveal = Animated.timing(sweep, { toValue: 1, duration: reduced ? 0 : 840,
      easing: Easing.out(Easing.cubic), useNativeDriver: true });
    if (!reduced) sweep.setValue(0);
    reveal.start();
    return () => reveal.stop();
  }, [finished, reduced, sweep]);

  useEffect(() => {
    if (finished || !fontsReady || (!ready && !error)) return;
    const exit = Animated.timing(opacity, { toValue: 0, delay: reduced ? 90 : 620,
      duration: reduced ? 0 : 250, useNativeDriver: true });
    exit.start(({ finished: complete }) => { if (complete) setFinished(true); });
    return () => exit.stop();
  }, [finished, fontsReady, ready, error, reduced, opacity]);

  if (finished) return null;
  return <Animated.View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
    style={[StyleSheet.absoluteFill, { zIndex: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background, opacity }]}>
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 168, height: 140 }}>
      {[-1, 1].map(direction => <Animated.View key={direction} style={{
        position: 'absolute', width: 162, height: 82, borderRadius: 82, borderWidth: 1,
        borderColor: direction === 1 ? palette.controlLine : palette.accent,
        transform: [{rotate: sweep.interpolate({inputRange: [0,1], outputRange: [direction * 74 + 'deg', direction * 24 + 'deg']})}],
      }}/>)}
      <Animated.View style={{transform: [{scale: sweep.interpolate({inputRange: [0,1], outputRange: [.73,1]})}]}}>
        <AppMark size={76} background={palette.accent} ink={palette.onAccent}/>
      </Animated.View>
    </View>
  </Animated.View>;
}
