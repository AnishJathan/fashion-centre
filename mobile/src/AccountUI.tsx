import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type ImageProps,
} from "react-native";
import { Body, Heading, Icon, Status, usePalette } from "./ui";
import { previewHeight } from "./photo/layout";

/** One large accessible target, rather than a small switch beside untappable text. */
export function ConsentRow({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={({ pressed }) => ({
        minHeight: 48,
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
        padding: 10,
        borderWidth: 1,
        borderRadius: 12,
        borderColor: checked ? p.accent : p.line,
        backgroundColor: checked ? p.tint : p.surface,
        opacity: disabled ? 0.6 : pressed ? 0.75 : 1,
      })}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          height: 22,
          width: 22,
          flexShrink: 0,
          borderRadius: 3,
          borderWidth: 1.5,
          borderColor: checked ? p.accent : p.muted,
          backgroundColor: checked ? p.accent : p.surface,
          alignItems: "center",
          justifyContent: "center",
          marginTop: 2,
        }}
      >
        {checked && <Icon name="check" size={16} color={p.onAccent} />}
      </View>
      <Text style={{ flex: 1, color: p.text, fontSize: 14, lineHeight: 21 }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function AccountNotice({
  message,
  title,
  error = false,
  busy = false,
  compact = false,
}: {
  message: string;
  title?: string;
  error?: boolean;
  busy?: boolean;
  compact?: boolean;
}) {
  const p = usePalette();
  if (!message) return null;
  if (compact) return (
    <View accessibilityRole={error ? "alert" : undefined} accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 6 }}>
      {busy ? <ActivityIndicator color={p.accent} size="small" accessibilityLabel="In progress" /> : <Icon name="info" size={18} color={error ? p.error : p.muted} />}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        {!!title && <Text style={{ color: p.text, fontSize: 14, lineHeight: 20, fontWeight: "600" }}>{title}</Text>}
        <Text style={{ color: error ? p.error : p.muted, fontSize: 13, lineHeight: 19 }}>{message}</Text>
      </View>
    </View>
  );
  return (
    <View style={{ gap: 8 }}>
      {!!title && (
        <Text style={{ color: p.text, fontSize: 14, fontWeight: "700" }}>
          {title}
        </Text>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {busy && (
          <ActivityIndicator
            color={p.accent}
            accessibilityLabel="In progress"
          />
        )}
        <View style={{ flex: 1 }}>
          <Status message={message} error={error} />
        </View>
      </View>
    </View>
  );
}

export function PhotoPreview({
  label,
  compact = false,
  ...props
}: Omit<ImageProps, "style" | "accessibilityLabel" | "resizeMode"> & {
  label: string;
  compact?: boolean;
}) {
  const p = usePalette();
  const { width, height } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const sourceKey = JSON.stringify(props.source);
  React.useEffect(() => {
    setLoading(true);
    setFailed(false);
  }, [sourceKey]);
  return (
    <View
      onLayout={(event) => setMeasuredWidth(event.nativeEvent.layout.width)}
      style={{
        overflow: "hidden",
        borderRadius: 12,
        backgroundColor: p.tint,
        borderWidth: 1,
        borderColor: p.line,
      }}
    >
      <Image
        {...props}
        accessibilityLabel={label}
        resizeMode="contain"
        onLoadStart={() => {
          setLoading(true);
          props.onLoadStart?.();
        }}
        onLoadEnd={() => {
          setLoading(false);
          props.onLoadEnd?.();
        }}
        onError={(event) => {
          setFailed(true);
          setLoading(false);
          props.onError?.(event);
        }}
        style={{
          width: "100%",
          height: previewHeight(measuredWidth || width - 76, height, compact),
        }}
      />
      {(loading || failed) && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            padding: 12,
            gap: 8,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: p.tint,
          }}
        >
          {failed ? (
            <>
              <Icon name="image" size={24} color={p.muted} />
              <Body>
                The photo could not load. Choose another photo or retry.
              </Body>
            </>
          ) : (
            <ActivityIndicator
              color={p.accent}
              accessibilityLabel="Loading photo"
            />
          )}
        </View>
      )}
    </View>
  );
}

export function AccountSection({
  step,
  title,
  description,
}: {
  step?: string;
  title: string;
  description?: string;
}) {
  const p = usePalette();
  return (
    <View style={{ gap: 6 }}>
      {!!step && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: p.accent, fontSize: 11, lineHeight: 18, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", flexShrink: 1 }}>{step}</Text>
          <View style={{ flex: 1, minWidth: 20, height: 1, backgroundColor: p.line }} />
        </View>
      )}
      <Heading>{title}</Heading>
      {!!description && <Body>{description}</Body>}
    </View>
  );
}


/** Public catalogue imagery only; private account photos remain behind the account check. */
export function SelectedGarment({ name, brand, uri }: { name: string; brand: string; uri: string }) {
  const p = usePalette();
  const [failedUri, setFailedUri] = useState("");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 10, backgroundColor: p.surface, borderWidth: 1, borderColor: p.line, borderRadius: 12 }}>
      <View style={{ width: 84, height: 108, flexShrink: 0, borderRadius: 8, backgroundColor: p.tint, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
        {uri && failedUri !== uri ? <Image source={{ uri }} accessibilityLabel={`Selected garment: ${name}`} resizeMode="contain" onError={() => setFailedUri(uri)} style={{ width: "100%", height: "100%" }} /> : <Icon name="image" size={26} color={p.muted} />}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
        <Text style={{ color: p.accent, fontSize: 11, lineHeight: 16, fontWeight: "600" }}>Selected for your try-on</Text>
        <Text accessibilityRole="header" style={{ color: p.text, fontSize: 16, lineHeight: 22, fontWeight: "700" }}>{name}</Text>
        <Text style={{ color: p.muted, fontSize: 12, lineHeight: 18 }}>{brand}</Text>
      </View>
    </View>
  );
}
