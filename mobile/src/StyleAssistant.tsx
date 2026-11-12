import React, { useEffect, useId, useRef, useState } from 'react';
import {
  AccessibilityInfo, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, Text, TextInput, View, findNodeHandle, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { Icon, usePalette } from './ui';
import type { Route } from './navigation';
import {
  STYLE_CHAT_HISTORY_LIMIT, STYLE_CHAT_LIMIT, styleAssistantLayout, styleAssistantPrice,
  styleAssistantReply, styleAssistantStarters, styleAssistantWelcome,
  type StyleAssistantContext, type StyleReply,
} from './styleAssistant';

export type StyleAssistantProps = StyleAssistantContext & {
  onNavigate: (route: Route) => void;
  /** Inline is a separate 48px touch target beside the dock, never another nav tab. */
  launcherMode?: 'floating' | 'inline';
  bottomOffset?: number;
};
type Message = { id: number; role: 'user'; text: string } | { id: number; role: 'helper'; reply: StyleReply };

function AssistantMark({ gradientId }: { gradientId: string }) {
  return <Svg width={36} height={36} viewBox="0 0 48 48" accessible={false} focusable={false}>
    <Defs><RadialGradient id={gradientId} cx="30%" cy="26%" r="88%">
      <Stop offset="0" stopColor="#0083BF" /><Stop offset="0.28" stopColor="#006ADF" />
      <Stop offset="0.56" stopColor="#0057D9" /><Stop offset="0.78" stopColor="#007B91" />
      <Stop offset="1" stopColor="#0A8A83" />
    </RadialGradient></Defs>
    <Circle cx={24} cy={24} r={23} fill={`url(#${gradientId})`} />
    <Path d="M24 11 C24 19 29 24 37 24 C29 24 24 29 24 37 C24 29 19 24 11 24 C19 24 24 19 24 11Z" fill="#FFFFFF" />
    <Circle cx={35} cy={13} r={2.3} fill="#FFFFFF" />
  </Svg>;
}

/** Only transient text state and local catalogue reads. No assistant network or persistence. */
export function StyleAssistant({
  products, onNavigate, brandId, currentProductId, catalogueLoading, catalogueError,
  launcherMode = 'floating', bottomOffset = 84,
}: StyleAssistantProps) {
  const palette = usePalette(), insets = useSafeAreaInsets();
  // Navigation keeps several route shells mounted. SVG references must never
  // resolve to a gradient inside another screen's hidden helper.
  const gradientId = `assistant-orb-${useId().replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const { width, height, fontScale } = useWindowDimensions();
  const context: StyleAssistantContext = { products, brandId, currentProductId, catalogueLoading, catalogueError };
  const layout = styleAssistantLayout(width - insets.left - insets.right, height - insets.top - insets.bottom, fontScale);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const serial = useRef(0);
  const transcript = useRef<React.ElementRef<typeof ScrollView>>(null);
  const heading = useRef<React.ElementRef<typeof Text>>(null);
  const launcher = useRef<React.ElementRef<typeof View>>(null);
  const restoreTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const focus = (element: React.ElementRef<typeof View> | null) => {
    if (Platform.OS === 'web') {
      (element as unknown as { focus?: () => void } | null)?.focus?.();
    } else if (element) {
      const handle = findNodeHandle(element);
      if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    }
  };
  function close() {
    Keyboard.dismiss();
    setOpen(false);
    setInput('');
    setMessages([]);
    clearTimeout(restoreTimer.current);
    restoreTimer.current = setTimeout(() => focus(launcher.current), 250);
  }
  useEffect(() => () => clearTimeout(restoreTimer.current), []);
  useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close(); } };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [open]);
  // A reused shell must not carry a chat transcript into another store or garment.
  useEffect(() => {
    clearTimeout(restoreTimer.current);
    if (open) Keyboard.dismiss();
    setOpen(false); setInput(''); setMessages([]);
  }, [brandId, currentProductId]);

  function submit(value: string) {
    const text = value.trim().slice(0, STYLE_CHAT_LIMIT);
    if (!text) return;
    const answer = styleAssistantReply(text, context);
    setMessages(previous => [...previous,
      { id: ++serial.current, role: 'user' as const, text },
      { id: ++serial.current, role: 'helper' as const, reply: answer },
    ].slice(-STYLE_CHAT_HISTORY_LIMIT));
    setInput('');
    if (Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(answer.text);
  }
  function navigate(route: Route) {
    close();
    // The next screen owns focus; do not focus the now-hidden dock after navigation.
    clearTimeout(restoreTimer.current);
    onNavigate(route);
  }
  function renderReply(answer: StyleReply, key: string | number) {
    const liveMatches = answer.productIds.flatMap(id => {
      const product = products.find(item => item.id === id && (!brandId || item.brandId === brandId));
      return product ? [product] : [];
    });
    return <View key={key} testID="style-helper-reply" style={{ gap: 8, alignSelf: 'stretch', padding: 10, borderRadius: 14, borderTopLeftRadius: 5, backgroundColor: palette.tint }}>
      <Text accessibilityLiveRegion="polite" style={{ color: palette.text, fontSize: 14, lineHeight: 21 }}>{answer.text}</Text>
      {liveMatches.map(product => <Pressable key={product.id} testID={`style-product-${product.id}`}
        accessibilityRole="button" accessibilityLabel={`View ${product.name}, ${product.brandName}, ${styleAssistantPrice(product, answer.currency)}`}
        onPress={() => navigate({ name: 'product', productId: product.id, brandId: product.brandId })}
        style={({ pressed }) => ({ minHeight: 64, minWidth: 48, padding: 12, gap: 3, borderRadius: 12, backgroundColor: palette.surface, borderColor: palette.line, borderWidth: 1, opacity: pressed ? 0.72 : 1 })}>
        <Text style={{ color: palette.text, fontSize: 14, lineHeight: 20, fontWeight: '700' }}>{product.name}</Text>
        <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 18 }}>{product.brandName} · {product.category}</Text>
        <Text style={{ color: palette.accent, fontSize: 13, lineHeight: 19, fontWeight: '600' }}>{styleAssistantPrice(product, answer.currency)}</Text>
      </Pressable>)}
      {answer.productIds.length > liveMatches.length && <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 19 }}>Some pieces are no longer in the loaded catalogue. Ask again to refresh your matches.</Text>}
      {answer.actions.map(action => <Pressable key={action.label} accessibilityRole="button" accessibilityLabel={action.label}
        onPress={() => {
          // Revalidate a previously suggested garment against the latest catalogue.
          const current = action.route.productId && products.find(product => product.id === action.route.productId && (!brandId || product.brandId === brandId));
          navigate(action.route.name === 'prepare' && !current ? { name: 'prepare', ...(brandId ? { brandId } : {}) } : action.route);
        }}
        style={({ pressed }) => ({ minHeight: 48, minWidth: 48, paddingHorizontal: 13, paddingVertical: 12, justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: palette.controlLine, backgroundColor: palette.surface, opacity: pressed ? 0.72 : 1 })}>
        <Text style={{ color: palette.accent, fontSize: 14, lineHeight: 20, fontWeight: '700' }}>{action.label}</Text>
      </Pressable>)}
    </View>;
  }
  return <>
    <Pressable ref={launcher} testID="style-assistant-launcher" accessibilityRole="button"
      accessibilityLabel="Open local style helper" accessibilityHint="Search loaded products and get shopping help. Not live AI."
      accessibilityState={{ expanded: open }}
      onPress={() => { clearTimeout(restoreTimer.current); setOpen(true); }}
      style={({ pressed }) => ({
        ...(launcherMode === 'floating' ? { position: 'absolute' as const, right: Math.max(12, insets.right), bottom: bottomOffset + insets.bottom, zIndex: 10 } : {}),
        width: 48, height: 48, minWidth: 48, minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
        opacity: pressed ? 0.8 : 1,
      })}>
      <View testID="style-assistant-orb" pointerEvents="none" style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, shadowColor: '#101B2D', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3 }}>
        <AssistantMark gradientId={gradientId} />
      </View>
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={close} onShow={() => focus(heading.current)}>
      <View style={{ flex: 1, backgroundColor: '#0B142455' }}>
        <Pressable testID="style-assistant-backdrop" accessible={false} onPress={close} style={{ position: 'absolute', inset: 0 }} />
        <KeyboardAvoidingView pointerEvents="box-none" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingTop: Math.max(12, insets.top), paddingBottom: Math.max(12, insets.bottom), paddingLeft: insets.left, paddingRight: insets.right }}>
          <View testID="style-assistant-panel" accessibilityViewIsModal style={{ width: layout.panelWidth, height: layout.panelHeight, maxHeight: '100%', flexShrink: 1, borderRadius: 20, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, overflow: 'hidden' }}>
            <View testID="style-assistant-header" style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 4, paddingVertical: 4, borderBottomWidth: 1, borderColor: palette.line }}>
              <Text ref={heading} accessible accessibilityRole="header" style={{ flex: 1, minWidth: 0, color: palette.text, fontSize: 16, lineHeight: 22, fontWeight: '700' }}>Local style helper</Text>
              <Pressable testID="style-assistant-close" accessibilityRole="button" accessibilityLabel="Close and clear chat" onPress={close}
                style={({ pressed }) => ({ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: pressed ? palette.tint : palette.surface })}>
                <Icon name="x" size={22} color={palette.text} />
              </Pressable>
            </View>
            <ScrollView ref={transcript} testID="style-assistant-transcript" style={{ flex: 1, minHeight: 0 }}
              contentContainerStyle={{ padding: 10, gap: 8 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
              onContentSizeChange={() => { if (messages.length) transcript.current?.scrollToEnd({ animated: false }); }}>
              <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 18 }}>Local demo · Not live AI. No chat messages or photos are sent anywhere. Clears on close.</Text>
              {renderReply(styleAssistantWelcome(context), 'welcome')}
              {!messages.length && <ScrollView testID="style-assistant-starters" horizontal showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
                {styleAssistantStarters(context).map(starter => <Pressable key={starter} accessibilityRole="button" accessibilityLabel={starter} onPress={() => submit(starter)}
                  style={({ pressed }) => ({ minHeight: 48, minWidth: 48, maxWidth: layout.panelWidth - 20, paddingHorizontal: 12, paddingVertical: 8, justifyContent: 'center', borderRadius: 24, borderWidth: 1, borderColor: palette.controlLine, backgroundColor: pressed ? palette.tint : palette.surface })}>
                  <Text style={{ color: palette.accent, fontSize: 13, lineHeight: 19, fontWeight: '600' }}>{starter}</Text>
                </Pressable>)}
              </ScrollView>}
              {messages.map(message => message.role === 'helper' ? renderReply(message.reply, message.id) : <View key={message.id} style={{ alignSelf: 'flex-end', maxWidth: '94%', padding: 10, borderRadius: 14, borderTopRightRadius: 5, backgroundColor: palette.accent }}>
                <Text accessibilityLabel={`You: ${message.text}`} style={{ color: palette.onAccent, fontSize: 14, lineHeight: 21 }}>{message.text}</Text>
              </View>)}
            </ScrollView>
            <View testID="style-assistant-composer" style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'flex-end', gap: 6, padding: 8, borderTopWidth: 1, borderColor: palette.line }}>
              <TextInput testID="style-assistant-input" accessibilityLabel="Message the local style helper" placeholder="Find a piece or ask for help"
                placeholderTextColor={palette.muted} value={input} onChangeText={setInput} maxLength={STYLE_CHAT_LIMIT}
                returnKeyType="send" submitBehavior="submit" onSubmitEditing={() => submit(input)}
                style={{ flex: 1, minWidth: 0, minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: palette.controlLine, color: palette.text, backgroundColor: palette.background, paddingHorizontal: 10, paddingVertical: 10, fontSize: 14, lineHeight: 20 }} />
              <Pressable testID="style-assistant-send" accessibilityRole="button" accessibilityLabel="Send message" accessibilityState={{ disabled: !input.trim() }} disabled={!input.trim()} onPress={() => submit(input)}
                style={({ pressed }) => ({ width: 48, height: 48, minWidth: 48, minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: !input.trim() ? palette.disabled : palette.accent, opacity: pressed ? 0.72 : 1 })}>
                <Icon name="arrow-up" size={22} color={!input.trim() ? palette.muted : palette.onAccent} />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  </>;
}
