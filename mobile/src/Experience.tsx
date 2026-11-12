import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, Modal, Platform, Pressable, ScrollView, Text, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from './state';
import type { Route } from './navigation';
import { moods, moodProducts, storyCopy, studioProducts, type MoodId } from './experience';
import { Body, Button, Heading, Icon, IconButton, usePalette } from './ui';
import { ProductGrid } from './ShoppingComponents';

const serif = Platform.OS === 'android' ? 'serif' : 'Georgia';
const imagery = [require('../assets/editorial/campaign.png'), require('../assets/editorial/evening.jpg'), require('../assets/editorial/street.jpg')] as ImageSourcePropType[];
const white = '#FFF9EF';
export function ExperienceIntro({ navigate, mood, onMood, onBrowse, compact = false }: { compact?: boolean; navigate: (route: Route) => void; mood: MoodId; onMood: (value: MoodId) => void; onBrowse: () => void }) {
  const a = useApp(), p = usePalette(), window = useWindowDimensions(), insets = useSafeAreaInsets();
  const [story, setStory] = useState<number | null>(null);
  const [studio, setStudio] = useState(false);
  const [step, setStep] = useState(0);
  const [studioMood, setStudioMood] = useState<MoodId>('all');
  const [category, setCategory] = useState('All');
  const opacity = useRef(new Animated.Value(1)).current;
  const storyScroll = useRef<React.ElementRef<typeof ScrollView>>(null);
  const studioScroll = useRef<React.ElementRef<typeof ScrollView>>(null);
  useEffect(() => { storyScroll.current?.scrollTo({ y: 0, animated: false }); }, [story]);
  useEffect(() => { studioScroll.current?.scrollTo({ y: 0, animated: false }); }, [step, studio]);
  const reduceMotion = useRef(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) reduceMotion.current = value; });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { reduceMotion.current = value; });
    return () => { active = false; subscription.remove(); opacity.stopAnimation(); };
  }, [opacity]);
  function moveStory(next: number) {
    setStory(Math.max(0, Math.min(storyCopy.length - 1, next)));
    opacity.stopAnimation();
    opacity.setValue(reduceMotion.current ? 1 : 0.55);
    if (!reduceMotion.current) Animated.timing(opacity, { toValue: 1, duration: 240, useNativeDriver: true }).start();
  }
  function openStudio() { setStudioMood(mood); setCategory('All'); setStep(0); setStudio(true); }
  const selected = storyCopy[story ?? 0];
  const candidates = moodProducts(a.products, studioMood);
  const categories = ['All', ...new Set(candidates.map(item => item.category).filter(Boolean))];
  const results = studioProducts(a.products, studioMood, category);
  const heroHeight = window.fontScale > 1.3 ? 470 : Math.min(490, Math.max(360, window.height * 0.5));
  const micro = { fontSize: 10, lineHeight: 16, letterSpacing: 2, fontWeight: '700' as const };
  return <>
    {compact && <View style={{ gap: 12 }}>
      <Text style={{ color: p.text, fontSize: 14, fontWeight: '600' }}>More ways to find your style</Text>
      <View style={{ flexDirection: window.fontScale >= 1.4 ? 'column' : 'row', gap: 10 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Open the style studio, build a local edit in two steps" onPress={openStudio} style={({ pressed }) => ({ flex: 1, minHeight: 76, borderRadius: 9, padding: 9, gap: 3, backgroundColor: pressed ? p.line : p.tint })}><Icon name="sliders" color={p.accent} size={18} /><Text style={{ color: p.text, fontWeight: '600', fontSize: 13 }}>Style finder</Text><Text style={{ color: p.muted, fontSize: 12, lineHeight: 18 }}>2 steps to your local edit →</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Enter the edit, a three chapter style story" onPress={() => moveStory(0)} style={({ pressed }) => ({ flex: 1, minHeight: 76, borderRadius: 9, padding: 9, gap: 3, backgroundColor: pressed ? '#E0CB70' : '#FFE694' })}><Icon name="play-circle" color="#563D11" size={18} /><Text style={{ color: '#49300B', fontWeight: '600', fontSize: 13 }}>Style stories</Text><Text style={{ color: '#634917', fontSize: 12, lineHeight: 18 }}>Tap through 3 style chapters →</Text></Pressable>
      </View>
    </View>}
    {!compact && <>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <Text style={{ ...micro, color: p.muted }}>THE EDIT / VOL. 01</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Browse the collection" onPress={onBrowse} style={{ minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center' }}><Icon name="search" size={21} /></Pressable>
    </View>
    <View style={{ minHeight: heroHeight, borderRadius: 4, overflow: 'hidden', backgroundColor: '#332C26' }}>
      <Image source={imagery[0]} resizeMode="cover" accessible={false} style={{ position: 'absolute', right: 0, width: window.width >= 700 ? '55%' : '100%', height: '100%' }} />
      <View style={{ position: 'absolute', inset: 0, backgroundColor: window.width >= 700 ? 'rgba(18,16,14,0.15)' : 'rgba(18,16,14,0.58)' }} />
      <View style={{ flex: 1, minHeight: heroHeight, justifyContent: 'space-between', padding: 24, width: window.width >= 700 ? '48%' : '100%' }}>
        <View style={{ alignSelf: 'flex-start', backgroundColor: '#F7F4EF', paddingHorizontal: 10, paddingVertical: 6 }}><Text style={{ ...micro, color: '#282421' }}>A NEW PERSPECTIVE</Text></View>
        <View style={{ gap: 14, alignItems: 'flex-start', paddingTop: 24 }}>
          <Text accessibilityRole="header" style={{ color: white, fontFamily: serif, fontSize: window.width < 360 ? 40 : 46, lineHeight: window.width < 360 ? 44 : 49, letterSpacing: -1.4 }}>Wear a{ '\n' }new feeling.</Text>
          <Text style={{ color: white, fontSize: 13, lineHeight: 20 }}>A world of style. A point of view that's yours.</Text>
          <Pressable accessibilityRole="button" onPress={() => moveStory(0)} accessibilityLabel="Enter the edit, a three chapter style story" style={({ pressed }) => ({ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 20, paddingHorizontal: 17, backgroundColor: pressed ? '#E5D9C8' : white })}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#282421' }}>Enter the edit</Text><Icon name="arrow-up-right" color="#282421" size={20} />
          </Pressable>
        </View>
      </View>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}><Text style={{ color: p.muted, fontSize: 11, lineHeight: 17 }}>Editorial inspiration · Fictional collections</Text><Text style={{ color: p.accent, ...micro }}>01 — 03</Text></View>
    <View style={{ gap: 14, paddingTop: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Heading>Find your feeling</Heading><Icon name="sliders" color={p.muted} size={18} /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 9, paddingVertical: 2 }}>
        {moods.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: item.id === mood }} onPress={() => onMood(item.id)} style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 18, justifyContent: 'center', borderRadius: 30, borderWidth: 1, borderColor: item.id === mood ? p.accent : p.line, backgroundColor: item.id === mood ? p.accent : pressed ? p.tint : p.surface })}><Text style={{ color: item.id === mood ? p.onAccent : p.text, fontSize: 13, fontWeight: '500' }}>{item.label}</Text></Pressable>)}
      </ScrollView>
      <Text style={{ color: p.muted, fontSize: 14, lineHeight: 21 }} accessibilityLiveRegion="polite">{moods.find(item => item.id === mood)?.note}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Explore ${moodProducts(a.products, mood).length} pieces in this mood`} onPress={onBrowse} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: p.line, paddingBottom: 12 }}><Text style={{ color: p.accent, fontSize: 13, fontWeight: '600' }}>Explore {moodProducts(a.products, mood).length} pieces</Text><Icon name="arrow-right" color={p.accent} size={18} /></Pressable>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Open the style studio, build a local edit in two steps" onPress={openStudio} style={({ pressed }) => ({ backgroundColor: pressed ? '#532636' : '#743244', borderRadius: 4, padding: 22, gap: 15 })}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ ...micro, color: '#F9E7DD' }}>THE STYLE STUDIO</Text><Icon name="arrow-up-right" color={white} size={23} /></View>
      <Text style={{ fontFamily: serif, fontSize: 29, lineHeight: 35, color: white }}>A little more you.</Text>
      <Text style={{ color: '#F9E7DD', fontSize: 14, lineHeight: 21 }}>Pick a mood. Find your pieces. Build an edit in two small steps.</Text>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#F9E7DD' }} /><Text style={{ color: '#F9E7DD', fontSize: 11, lineHeight: 18 }}>Local discovery · No photo needed</Text></View>
    </Pressable>
    </>}
    <Modal visible={story !== null} animationType="none" onRequestClose={() => setStory(null)} presentationStyle="fullScreen">
      <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: '#221E1B', paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Math.max(20, insets.left, insets.right), gap: 12 }}>
          <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>{storyCopy.map((item, i) => <View key={item.kicker} style={{ height: 3, flex: 1, backgroundColor: i <= (story ?? 0) ? white : '#6B6057' }} />)}</View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close editorial story" onPress={() => setStory(null)} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><Icon name="x" color={white} /></Pressable>
        </View>
        <ScrollView ref={storyScroll} contentContainerStyle={{ flexGrow: 1, paddingHorizontal: Math.max(20, insets.left, insets.right), gap: 20, paddingBottom: 20 }}>
          <Animated.View style={{ opacity }}><Image source={imagery[story ?? 0]} resizeMode="cover" accessible accessibilityLabel="Editorial style inspiration, not a try-on result" style={{ width: '100%', height: Math.min(520, Math.max(360, (Math.min(window.width, 520) - 40) * 1.2)), maxWidth: 520, alignSelf: 'center', borderRadius: 3 }} /></Animated.View>
          <Text style={{ ...micro, color: '#DEBCAC' }}>{selected.kicker}</Text>
          <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={{ fontFamily: serif, color: white, fontSize: 40, lineHeight: 44 }}>{selected.title}</Text>
          <Text style={{ color: '#E2D5C6', fontSize: 16, lineHeight: 25 }}>{selected.description}</Text>
          <Button label={story === 2 ? 'Explore the collection' : 'Explore this mood'} onPress={() => { setStory(null); onMood(selected.mood); onBrowse(); }} />
          <Text style={{ color: '#C9BDB0', fontSize: 11, lineHeight: 17 }}>Editorial imagery and fictional demo pieces. No live stock or purchases.</Text>
        </ScrollView>
        <View style={{ flexDirection: 'row', paddingHorizontal: 20, justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8 }}>
          <Pressable disabled={story === 0} accessibilityState={{ disabled: story === 0 }} accessibilityRole="button" accessibilityLabel="Previous story chapter" onPress={() => moveStory((story ?? 0) - 1)} style={{ minHeight: 48, minWidth: 70, justifyContent: 'center', opacity: story === 0 ? .35 : 1 }}><Text style={{ color: white }}>← Previous</Text></Pressable>
          <Text style={{ color: '#E2D5C6', fontSize: 12 }}>Chapter {(story ?? 0) + 1} of 3</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={story === 2 ? 'Finish story' : 'Next story chapter'} onPress={() => story === 2 ? setStory(null) : moveStory((story ?? 0) + 1)} style={{ minHeight: 48, minWidth: 70, alignItems: 'flex-end', justifyContent: 'center' }}><Text style={{ color: white }}>{story === 2 ? 'Done' : 'Next →'}</Text></Pressable>
        </View>
      </View>
    </Modal>
    <Modal visible={studio} animationType="none" onRequestClose={() => setStudio(false)} presentationStyle="fullScreen">
      <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: p.background, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Math.max(20, insets.left, insets.right), borderBottomWidth: 1, borderColor: p.line }}><Text style={{ ...micro, color: p.accent }}>THE STYLE STUDIO</Text><IconButton name="x" label="Close style studio" onPress={() => setStudio(false)} /></View>
        <ScrollView ref={studioScroll} contentContainerStyle={{ width: '100%', maxWidth: 1040, alignSelf: 'center', padding: 24, paddingLeft: Math.max(24, insets.left), paddingRight: Math.max(24, insets.right), gap: 22 }}>
          <Text style={{ ...micro, color: p.muted }}>{step < 2 ? `0${step + 1} / 02` : 'YOUR PERSONAL EDIT'}</Text>
          <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={{ fontFamily: serif, fontSize: 38, lineHeight: 43, color: p.text }}>{step === 0 ? 'What’s the mood?' : step === 1 ? 'Start with a piece.' : 'This feels like you.'}</Text>
          <Body>{step === 0 ? 'No rules. Just the direction you feel like taking.' : step === 1 ? 'Choose a category from this mood’s available demo catalogue.' : `${results.length} fictional ${results.length === 1 ? 'piece' : 'pieces'} matched your choices. Try a piece on or explore the details.`}</Body>
          {step === 0 && moods.map((item, index) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: item.id === studioMood }} onPress={() => { setStudioMood(item.id); setCategory('All'); }} style={({ pressed }) => ({ flexDirection: 'row', gap: 16, padding: 19, minHeight: 90, borderWidth: 1, borderColor: studioMood === item.id ? p.accent : p.line, backgroundColor: studioMood === item.id || pressed ? p.tint : p.surface, alignItems: 'center' })}><Text style={{ color: p.accent, fontFamily: serif, fontSize: 26 }}>0{index + 1}</Text><View style={{ flex: 1, gap: 4 }}><Text style={{ color: p.text, fontSize: 16, fontWeight: '600' }}>{item.label}</Text><Text style={{ color: p.muted, fontSize: 13, lineHeight: 20 }}>{item.note}</Text></View><Icon name={studioMood === item.id ? 'check-circle' : 'circle'} color={p.accent} /></Pressable>)}
          {step === 1 && categories.map(item => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: item === category }} onPress={() => setCategory(item)} style={{ padding: 20, minHeight: 64, borderBottomWidth: 1, borderColor: p.line, flexDirection: 'row', justifyContent: 'space-between', backgroundColor: category === item ? p.tint : p.surface }}><Text style={{ color: p.text, fontSize: 17 }}>{item === 'All' ? 'Show me everything' : item}</Text><Icon name={category === item ? 'check' : 'plus'} color={p.accent} /></Pressable>)}
          {step === 2 && <><ProductGrid onTryOn={product => { setStudio(false); navigate({ name: 'try-on', productId: product.id, brandId: product.brandId }); }} products={results} onView={product => { setStudio(false); navigate({ name: 'product', productId: product.id, brandId: product.brandId }); }} />{!results.length && <Body>No matching pieces in your enabled stores. Try another mood, or add a demo store.</Body>}<Button secondary label="Start another edit" onPress={() => { setStep(0); setCategory('All'); }} /><Button label="Browse the full collection" onPress={() => { setStudio(false); onMood('all'); onBrowse(); }} /></>}
          {step < 2 && <Button label={step === 0 ? 'Choose your pieces →' : 'Reveal my edit →'} onPress={() => setStep(step + 1)} />}
          {step === 1 && <Button secondary label="Back to mood" onPress={() => setStep(0)} />}
          <Text style={{ color: p.muted, fontSize: 12, lineHeight: 19 }}>A local edit based on your mood and category. Fictional pieces, ready to explore.</Text>
        </ScrollView>
      </View>
    </Modal>
  </>;
}
