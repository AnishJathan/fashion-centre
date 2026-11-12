import React, { useEffect, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import { ActivityIndicator, AppState, Image, Text, View, useWindowDimensions } from "react-native";
import type { Route } from "./navigation";
import { apiFetch, apiUrl } from "./core/api";
import { Body, Button, Icon, Screen, usePalette } from "./ui";
import {
  profileGridColumns,
  sessionResultPath,
  tryOnSession,
  verifyProfileAccount,
  type AccountTicket,
  type ProfileAccount,
  type SessionLook,
} from "./profileSession";

type Props = { navigate: (route: Route) => void };
type Verified = { account: ProfileAccount; ticket: AccountTicket };
type Phase = "loading" | "ready" | "signed-out" | "unavailable";

export function PersonalProfile(props: Props) {
  // Unmount private image views on every navigation away, then verify again on return.
  const focused = useIsFocused();
  return focused ? <ActivePersonalProfile {...props} /> : <View />;
}

function ActivePersonalProfile({ navigate }: Props) {
  const p = usePalette();
  const { width, fontScale } = useWindowDimensions();
  const [contentWidth, setContentWidth] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [verified, setVerified] = useState<Verified | null>(null);
  const [retry, setRetry] = useState(0);
  const [, setRevision] = useState(0);
  const [foreground, setForeground] = useState(AppState.currentState !== "background" && AppState.currentState !== "inactive");
  useEffect(() => tryOnSession.subscribe(() => setRevision((value) => value + 1)), []);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      setForeground(state === "active");
      if (state === "active") setRetry((value) => value + 1);
      setVerified(null);
      setPhase("loading");
    });
    return () => listener.remove();
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    setVerified(null);
    setPhase("loading");
    if (foreground) {
      void verifyProfileAccount(
        () => apiFetch("/api/auth/me", { signal: abort.signal, cache: "no-store" }),
        () => !abort.signal.aborted,
      ).then((result) => {
        if (abort.signal.aborted) return;
        setVerified(result);
        setPhase(result ? "ready" : "signed-out");
      }).catch(() => {
        if (!abort.signal.aborted) setPhase("unavailable");
      });
    }
    return () => abort.abort();
  }, [retry, foreground]);
  const ready = foreground && phase === "ready" && !!verified && tryOnSession.current(verified.ticket);
  const account = ready ? verified.account : null;
  const looks = ready ? tryOnSession.read(verified.ticket) : [];
  const unavailable = phase === "unavailable" || (phase === "ready" && !ready);
  const gridWidth = contentWidth || Math.min(width - 24, 680);
  const columns = profileGridColumns(gridWidth, fontScale);
  // Account for real gaps instead of percentages that wrap a second card off the row.
  const cardWidth = columns === 1 ? "100%" : Math.max(0, (gridWidth - (columns - 1) * 10) / columns);
  return (
    <Screen contentContainerStyle={{ maxWidth: 704, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, backgroundColor: p.tint, borderRadius: 12 }}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: p.accent }}>
          <Icon name="user" size={20} color={p.onAccent} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text accessibilityRole="header" style={{ color: p.text, fontSize: 18, lineHeight: 24, fontWeight: "700" }}>
            {account?.firstName || "Your profile"}
          </Text>
          <Text style={{ color: p.muted, fontSize: 12, lineHeight: 18 }}>
            {account ? account.phone || "Signed in" : "Your looks, in one place."}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text accessibilityRole="header" style={{ flex: 1, color: p.text, fontSize: 16, lineHeight: 22, fontWeight: "700" }}>Your try-ons</Text>
        {ready && <Text accessibilityLabel={`${looks.length} completed try-ons in this app session`} style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: p.tint, color: p.accent, borderRadius: 12, fontSize: 12, fontWeight: "700" }}>{looks.length}</Text>}
      </View>
      {(phase === "loading" || !foreground) ? (
        <View accessibilityLiveRegion="polite" style={{ padding: 12, gap: 8, alignItems: "center", backgroundColor: p.surface, borderRadius: 12 }}>
          <ActivityIndicator color={p.accent} accessibilityLabel="Checking your account" />
          <Body>Checking your account before showing your results…</Body>
        </View>
      ) : unavailable ? (
        <ProfileNotice title="Your looks are hidden" description="We couldn’t verify your account. Check your connection and try again to view this session’s results." icon="info">
          <Button label="Retry account check" secondary onPress={() => setRetry((value) => value + 1)} />
          <Button label="Open account" secondary onPress={() => navigate({ name: "login" })} />
        </ProfileNotice>
      ) : phase === "signed-out" ? (
        <ProfileNotice title="A space for your looks" description="Sign in to see try-ons completed during this app session." icon="image">
          <Button label="Sign in" onPress={() => navigate({ name: "login" })} />
          <Button label="Explore Try On" secondary icon="camera" onPress={() => navigate({ name: "prepare" })} />
        </ProfileNotice>
      ) : looks.length === 0 ? (
        <ProfileNotice title="Your next look starts here" description="No completed try-ons in this app session yet. Choose a piece to get started." icon="camera">
          <Button label="Try on a piece" icon="camera" onPress={() => navigate({ name: "prepare" })} />
        </ProfileNotice>
      ) : (
        <View onLayout={(event) => setContentWidth(event.nativeEvent.layout.width)} style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <Text style={{ color: p.muted, flex: 1, fontSize: 12, lineHeight: 18 }}>Recent results · This app session</Text>
            <Button label="New try-on" secondary icon="plus" onPress={() => navigate({ name: "prepare" })} />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 10 }}>
            {looks.map((look) => <View key={look.jobId} style={{ width: cardWidth }}><CompletedLook look={look} /></View>)}
          </View>
        </View>
      )}
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 2 }}>
        <Icon name="info" size={16} color={p.muted} />
        <Text style={{ flex: 1, color: p.muted, fontSize: 12, lineHeight: 18 }}>
          Older account history isn’t available yet. Only successful results seen in this app session can appear here. This list clears when you sign out or restart the app. Images may become unavailable.
        </Text>
      </View>
    </Screen>
  );
}

function ProfileNotice({ title, description, icon, children }: React.PropsWithChildren<{ title: string; description: string; icon: "image" | "camera" | "info" }>) {
  const p = usePalette();
  return <View style={{ padding: 12, gap: 10, borderRadius: 12, backgroundColor: p.surface, borderWidth: 1, borderColor: p.line }}>
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 10, backgroundColor: p.tint, alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={18} color={p.accent} /></View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text accessibilityRole="header" style={{ color: p.text, fontSize: 16, lineHeight: 22, fontWeight: "700" }}>{title}</Text>
        <Text style={{ color: p.muted, fontSize: 14, lineHeight: 20 }}>{description}</Text>
      </View>
    </View>
    {children}
  </View>;
}

function CompletedLook({ look }: { look: SessionLook }) {
  const p = usePalette();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  // Build only the known backend result path from a genuinely completed job ID.
  // Client account scoping does not fix the legacy server's missing ownership enforcement.
  let uri = "";
  try { uri = apiUrl(sessionResultPath(look.jobId)); } catch {}
  return <View style={{ borderRadius: 12, borderWidth: 1, borderColor: p.line, backgroundColor: p.surface, overflow: "hidden" }}>
    <View style={{ aspectRatio: 3 / 4, backgroundColor: p.tint }}>
      {!failed && !!uri && <Image
        key={retry}
        source={{ uri, cache: "reload" }}
        resizeMode="contain"
        accessibilityLabel={`Your generated try-on: ${look.productName}`}
        style={{ width: "100%", height: "100%" }}
        onLoadStart={() => setLoading(true)}
        onLoad={() => setLoading(false)}
        onError={() => { setFailed(true); setLoading(false); }}
      />}
      {(failed || !uri) ? <View style={{ position: "absolute", inset: 0, gap: 10, padding: 10, alignItems: "center", justifyContent: "center" }}>
        <Icon name="image" size={24} color={p.muted} />
        <Text style={{ color: p.muted, fontSize: 12, lineHeight: 18, textAlign: "center" }}>This result is unavailable.</Text>
        <Button label="Reload image" secondary onPress={() => { setFailed(false); setLoading(true); setRetry((value) => value + 1); }} />
      </View> : loading && <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", backgroundColor: p.tint }}>
        <ActivityIndicator color={p.accent} accessibilityLabel="Loading completed try-on" />
      </View>}
    </View>
    <View style={{ gap: 4, padding: 8 }}>
      <Text style={{ color: p.accent, fontSize: 11, lineHeight: 16, fontWeight: "700" }}>{look.brandName}</Text>
      <Text style={{ color: p.text, fontSize: 13, lineHeight: 18, fontWeight: "600" }}>{look.productName}</Text>
      <Text style={{ color: p.muted, fontSize: 11, lineHeight: 16 }}>{new Date(look.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · Generated illustration</Text>
    </View>
  </View>;
}
