import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  Image,
  useWindowDimensions,
  type TextInputProps,
  type ViewStyle,
  type StyleProp,
  type ScrollViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { IconGlyph, type IconName } from "./IconGlyph";
import { useApp } from "./state";
import { apiUrl } from "./core/api";
import { metrics, pageLayout, palettes } from "./design";

export type { IconName } from "./IconGlyph";
type Palette = { [K in keyof typeof palettes.light]: string };
const PaletteContext = createContext<Palette | undefined>(undefined);
const BottomOverlayContext = createContext(0);
/** Clearance belongs to scroll content, not the viewport, so content can pass
 * behind a floating dock while the final control remains fully reachable. */
export function BottomOverlayProvider({ height, children }: React.PropsWithChildren<{ height: number }>) {
  return <BottomOverlayContext.Provider value={height}>{children}</BottomOverlayContext.Provider>;
}
export function useBottomOverlay() { return useContext(BottomOverlayContext); }
export function PaletteProvider({ palette, children }: React.PropsWithChildren<{ palette?: Palette }>) {
  return <PaletteContext.Provider value={palette}>{children}</PaletteContext.Provider>;
}
export function usePalette(): Palette {
  const override = useContext(PaletteContext);
  const theme = useApp().theme;
  return override || palettes[theme === "dark" ? "dark" : "light"];
}
/** Honour the OS/browser request for a solid, higher-contrast dock. */
export function useReducedTransparency() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.matchMedia === "function") {
      const preference = window.matchMedia("(prefers-reduced-transparency: reduce)");
      const update = () => setReduced(preference.matches);
      update();
      preference.addEventListener?.("change", update);
      return () => preference.removeEventListener?.("change", update);
    }
    if (Platform.OS !== "ios") return;
    let active = true, changed = false;
    const listener = AccessibilityInfo.addEventListener("reduceTransparencyChanged", value => {
      changed = true;
      if (active) setReduced(value);
    });
    // A slow initial query must not overwrite a more recent accessibility event.
    void AccessibilityInfo.isReduceTransparencyEnabled().then(value => { if (active && !changed) setReduced(value); }).catch(() => {});
    return () => { active = false; listener.remove(); };
  }, []);
  return reduced;
}

export function Icon({
  name,
  size = 20,
  color,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  const p = usePalette();
  return (
    <IconGlyph name={name} size={size} color={color || p.text} />
  );
}

export function Screen({
  children,
  contentContainerStyle,
  scrollRef,
  ...props
}: React.PropsWithChildren<Omit<ScrollViewProps, "children"> & { scrollRef?: React.RefObject<React.ElementRef<typeof ScrollView> | null> }>) {
  const p = usePalette(),
    insets = useSafeAreaInsets(),
    headerHeight = useHeaderHeight();
  const bottomOverlay = useContext(BottomOverlayContext);
  const { width, fontScale } = useWindowDimensions();
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);
  // A screen can occupy only part of a large window. Measure that viewport,
  // rather than treating every unfolded or multi-window surface as full width.
  const layout = pageLayout(availableWidth ?? width, fontScale, insets);
  return (
    <KeyboardAvoidingView
      onLayout={(event) => setAvailableWidth(event.nativeEvent.layout.width)}
      style={{ flex: 1, minWidth: 0, backgroundColor: p.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <ScrollView
        {...props}
        ref={scrollRef}
        style={[{ flex: 1, minWidth: 0 }, props.style]}
        contentContainerStyle={[
          {
            width: "100%",
            maxWidth: metrics.maxContentWidth,
            alignSelf: "center",
            paddingTop: 8,
            paddingLeft: layout.paddingLeft,
            paddingRight: layout.paddingRight,
            paddingBottom: Math.max(32, insets.bottom + 20),
            gap: 12,
          },
          contentContainerStyle,
          bottomOverlay > 0 ? { paddingBottom: Math.max(32, insets.bottom + 20, bottomOverlay + 12) } : undefined,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets={false}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
export function Title({ children }: React.PropsWithChildren) {
  const p = usePalette();
  return (
    <Text
      accessibilityRole="header"
      style={{
        fontSize: 18,
        lineHeight: 24,
        fontWeight: "700",
        color: p.text,
        letterSpacing: -0.3,
      }}
    >
      {children}
    </Text>
  );
}
export function Body({ children }: React.PropsWithChildren) {
  const p = usePalette();
  return (
    <Text
      style={{ color: p.muted, fontSize: 13, lineHeight: 19, flexShrink: 1 }}
    >
      {children}
    </Text>
  );
}
export function Heading({ children }: React.PropsWithChildren) {
  const p = usePalette();
  return (
    <Text
      accessibilityRole="header"
      style={{
        fontSize: 16,
        lineHeight: 22,
        fontWeight: "700",
        color: p.text,
        flexShrink: 1,
      }}
    >
      {children}
    </Text>
  );
}
export function Button({
  label,
  onPress,
  disabled = false,
  secondary = false,
  accessibilityLabel,
  busy = false,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  accessibilityLabel?: string;
  busy?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const p = usePalette(),
    unavailable = disabled || busy;
  const textColor = unavailable ? p.muted : secondary ? p.accent : p.onAccent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled: unavailable, busy }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minWidth: metrics.touch,
          minHeight: metrics.touch,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: metrics.controlRadius,
          flexDirection: "row",
          gap: 8,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: unavailable
            ? p.disabled
            : secondary
              ? p.tint
              : p.accent,
          opacity: pressed ? 0.74 : 1,
          flexShrink: 1,
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={textColor} size="small" accessible={false} />
      ) : icon ? (
        <Icon name={icon} color={textColor} size={18} />
      ) : null}
      <Text
        style={{
          fontSize: 13,
          lineHeight: 19,
          fontWeight: "600",
          color: textColor,
          textAlign: "center",
          flexShrink: 1,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function IconButton({
  name,
  label,
  onPress,
  selected = false,
  disabled = false,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: metrics.touch,
        minHeight: metrics.touch,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: selected ? p.tint : "transparent",
        opacity: disabled ? 0.45 : pressed ? 0.65 : 1,
      })}
    >
      <Icon name={name} color={selected ? p.accent : p.text} />
    </Pressable>
  );
}
export function Card({ children }: React.PropsWithChildren) {
  const p = usePalette();
  return (
    <View
      style={{
        backgroundColor: p.surface,
        borderColor: p.line,
        borderWidth: 1,
        borderRadius: metrics.cardRadius,
        padding: 12,
        gap: 8,
      }}
    >
      {children}
    </View>
  );
}
export function Row({ children }: React.PropsWithChildren) {
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
      }}
    >
      {children}
    </View>
  );
}
export function Badge({ children }: React.PropsWithChildren) {
  const p = usePalette();
  return (
    <Text
      style={{
        fontSize: 12,
        lineHeight: 18,
        fontWeight: "700",
        letterSpacing: 0.8,
        textTransform: "uppercase",
        color: p.accent,
      }}
    >
      {children}
    </Text>
  );
}
export function Field({
  label,
  hint,
  error,
  compact = false,
  ...props
}: {
  label: string;
  hint?: string;
  error?: string;
  compact?: boolean;
  value: string;
  onChangeText: (v: string) => void;
} & Omit<TextInputProps, "value" | "onChangeText">) {
  const p = usePalette(),
    [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      {!compact && <Text
        style={{
          color: p.text,
          fontSize: 14,
          lineHeight: 20,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>}
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error || hint}
        placeholderTextColor={p.muted}
        selectionColor={p.accent}
        {...props}
        onFocus={(event) => {
          setFocused(true);
          props.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          props.onBlur?.(event);
        }}
        style={[
          {
            minHeight: compact ? 44 : 48,
            borderWidth: compact ? 1 : 1.5,
            borderColor: error ? p.error : focused ? p.accent : p.controlLine,
            borderRadius: compact ? 8 : metrics.controlRadius,
            paddingHorizontal: compact ? 10 : 12,
            paddingVertical: compact ? 4 : 8,
            color: p.text,
            backgroundColor: p.surface,
            fontSize: compact ? 12 : 14,
            lineHeight: compact ? 17 : 20,
          },
          props.style,
        ]}
      />
      {!!(error || hint) && (
        <Text
          accessibilityLiveRegion={error ? "polite" : "none"}
          style={{
            color: error ? p.error : p.muted,
            fontSize: 13,
            lineHeight: 20,
          }}
        >
          {error || hint}
        </Text>
      )}
    </View>
  );
}
export function Choices({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
}) {
  const p = usePalette(),
    { width, fontScale } = useWindowDimensions();
  const scroll = useRef<React.ElementRef<typeof ScrollView>>(null),
    positions = useRef<Record<string, number>>({});
  const [availableWidth, setAvailableWidth] = useState(0);
  // Filter controls may live in a card or split pane smaller than the window.
  const layout = pageLayout(availableWidth || width, fontScale);
  const wrapped = options.length <= 4 || layout.compact;
  useEffect(() => {
    if (!wrapped && positions.current[value] !== undefined)
      scroll.current?.scrollTo({
        x: Math.max(0, positions.current[value] - 16),
        animated: false,
      });
  }, [value, wrapped, availableWidth]);
  const items = options.map((o) => (
    <Pressable
      key={o.value}
      accessibilityRole="radio"
      accessibilityLabel={o.label}
      accessibilityState={{ checked: value === o.value }}
      onLayout={(event) => {
        const x = event.nativeEvent.layout.x;
        positions.current[o.value] = x;
        if (!wrapped && o.value === value)
          scroll.current?.scrollTo({ x: Math.max(0, x - 16), animated: false });
      }}
      onPress={() => onChange(o.value)}
      style={({ pressed }) => ({
        minWidth: metrics.touch,
        minHeight: metrics.touch,
        maxWidth: wrapped
          ? "100%"
          : Math.max(48, availableWidth || layout.contentWidth),
        flexShrink: 1,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: value === o.value ? p.accent : p.controlLine,
        backgroundColor: value === o.value ? p.tint : p.surface,
        flexDirection: "row",
        gap: 6,
        alignItems: "center",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {value === o.value && <Icon name="check" size={16} color={p.accent} />}
      <Text
        style={{
          fontSize: 13,
          lineHeight: 19,
          color: value === o.value ? p.accent : p.text,
          fontWeight: value === o.value ? "600" : "400",
          flexShrink: 1,
        }}
      >
        {o.label}
      </Text>
    </Pressable>
  ));
  return (
    <View
      onLayout={(event) => setAvailableWidth(event.nativeEvent.layout.width)}
      style={{ gap: 9, minWidth: 0 }}
    >
      <Text
        style={{
          color: p.text,
          fontSize: 14,
          lineHeight: 20,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
      {wrapped ? (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={label}
          style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
        >
          {items}
        </View>
      ) : (
        <ScrollView
          ref={scroll}
          horizontal
          accessibilityRole="radiogroup"
          accessibilityLabel={label}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: 4 }}
        >
          {items}
        </ScrollView>
      )}
    </View>
  );
}
export function Photo({
  uri,
  label,
  height = 270,
  contain = false,
  allowRetry = true,
}: {
  uri: string;
  label: string;
  height?: number;
  contain?: boolean;
  allowRetry?: boolean;
}) {
  const [failed, setFailed] = useState(false),
    [loading, setLoading] = useState(true),
    p = usePalette();
  let resolved = "",
    configurationError = false;
  try {
    resolved = uri.startsWith("/") ? apiUrl(uri) : uri;
  } catch {
    configurationError = true;
  }
  useEffect(() => {
    setFailed(false);
    setLoading(true);
  }, [uri]);
  if (resolved && !failed)
    return (
      <View
        style={{
          height,
          width: "100%",
          borderRadius: 16,
          overflow: "hidden",
          backgroundColor: p.tint,
        }}
      >
        <Image
          source={{ uri: resolved }}
          accessibilityLabel={label}
          style={{ height: "100%", width: "100%" }}
          resizeMode={contain ? "contain" : "cover"}
          onLoadEnd={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setFailed(true);
          }}
        />
        {loading && (
          <View
            pointerEvents="none"
            accessible={false}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <ActivityIndicator color={p.accent} />
          </View>
        )}
      </View>
    );
  return (
    <View
      style={{
        minHeight: height,
        padding: 20,
        gap: 12,
        backgroundColor: p.tint,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name="image" size={24} color={p.muted} />
      <Body>
        {configurationError
          ? "Configure the backend origin to load this catalogue photo."
          : failed
            ? "Photo could not load"
            : "No catalogue photo supplied"}
      </Body>
      {failed && allowRetry && (
        <Button
          secondary
          label="Retry photo"
          onPress={() => {
            setLoading(true);
            setFailed(false);
          }}
        />
      )}
    </View>
  );
}
export function Status({
  message,
  error = false,
}: {
  message: string;
  error?: boolean;
}) {
  const p = usePalette();
  useEffect(() => {
    if (message && Platform.OS === "ios")
      AccessibilityInfo.announceForAccessibility(message);
  }, [message]);
  if (!message) return null;
  return (
    <View
      accessible
      accessibilityRole={error ? "alert" : "text"}
      accessibilityLabel={message}
      accessibilityLiveRegion={error ? "assertive" : "polite"}
      style={{
        flexDirection: "row",
        gap: 10,
        padding: 13,
        borderRadius: 14,
        backgroundColor: error ? p.errorSurface : p.tint,
        alignItems: "flex-start",
      }}
    >
      <Icon
        name={error ? "alert-circle" : "info"}
        size={18}
        color={error ? p.error : p.accent}
      />
      <Text
        style={{
          color: error ? p.error : p.text,
          fontSize: 13,
          lineHeight: 19,
          flex: 1,
        }}
      >
        {message}
      </Text>
    </View>
  );
}
