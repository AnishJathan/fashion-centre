import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { edits, phoneCoverAspect } from './editorial';
import { displayFont, metrics, motion } from './design';
import { useReducedMotion } from './Motion';
import { Button, usePalette } from './ui';

const fieldPhoto = require('../assets/editorial/field.jpg');
const photography = [fieldPhoto, require('../assets/editorial/off-duty.jpg'), require('../assets/editorial/accessories.jpg')];

export function EditorialCover({ hasStores, openCollection }: { hasStores: boolean; openCollection: () => void }) {
  const p = usePalette();
  const { width, fontScale } = useWindowDimensions();
  const wide = width >= 700 && fontScale < 1.5;
  const [index, setIndex] = useState(0);
  const edit = edits[index];
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) { opacity.stopAnimation(); opacity.setValue(1); }
    return () => opacity.stopAnimation();
  }, [reduced, opacity]);
  function select(next: number) {
    if (next === index) return;
    setIndex(next);
    if (!reduced) {
      opacity.stopAnimation();
      opacity.setValue(.5);
      Animated.timing(opacity, { toValue: 1, duration: motion.reveal, useNativeDriver: true }).start();
    }
  }
  return <View style={{ flexDirection: wide ? 'row-reverse' : 'column', backgroundColor: p.cover, borderRadius: metrics.cardRadius, overflow: 'hidden' }}>
    <Animated.View style={[wide ? { width: '52%' } : { width: '100%', aspectRatio: phoneCoverAspect }, { opacity }]}>
      <Image source={index === 0 && !wide ? require('../assets/editorial/field-wide.jpg') : photography[index]} accessibilityLabel={edit.alt} resizeMode="cover" style={{ position: 'absolute', width: '100%', height: '100%' }} />
    </Animated.View>
    <View style={{ flexGrow: 1, flexBasis: wide ? 0 : 'auto', minWidth: 0, padding: wide ? 32 : metrics.gap, paddingTop: wide ? 32 : 8, gap: wide ? 24 : 12 }}>
      <View accessibilityRole="toolbar" accessibilityLabel="Choose an edit" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
        {edits.map((item, i) => <Pressable key={item.label} accessibilityRole="button" accessibilityState={{ selected: i === index }} onPress={() => select(i)}
          style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', paddingHorizontal: 10, borderRadius: metrics.controlRadius, backgroundColor: i === index ? p.surface : 'transparent', opacity: pressed ? .65 : 1 })}>
          <Text style={{ color: i === index ? p.coverInk : p.coverMuted, fontSize: 13, fontWeight: '600' }}>{item.label}</Text>
        </Pressable>)}
      </View>
      <View accessibilityLiveRegion="polite" style={{ gap: metrics.compactGap }}>
        <Text accessibilityRole="header" style={{ fontFamily: displayFont, color: p.coverInk, fontSize: wide ? 60 : 37, lineHeight: wide ? 65 : 42, letterSpacing: -1.4 }}>
          {edit.firstLine}{wide ? '\n' : ' '}<Text style={{ color: p.accent }}>{edit.secondLine}</Text>
        </Text>
        <Text style={{ color: p.coverMuted, fontSize: 15, lineHeight: 22 }}>{edit.description}</Text>
      </View>
      <Button label={hasStores ? 'Browse the collection' : 'Choose a demo store'} icon="arrow-up-right" onPress={openCollection} style={{ alignSelf: 'flex-start' }} />
    </View>
  </View>;
}
