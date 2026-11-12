import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useApp } from "./state";
import type { Route } from "./navigation";
import { apiFetch } from "./core/api";
import { PersonalProfile } from "./PersonalProfile";
import {
  Screen,
  Title,
  Body,
  Button,
  Field,
  Badge,
  Status,
  usePalette,
} from "./ui";
import {
  FollowedStoreRow,
  SettingsChoice,
  SettingsContent,
  SettingsDivider,
  SettingsGroup,
  SettingsRow,
} from "./SettingsUI";
import {
  merchantReadinessBlockers,
  shopifyDomain,
} from "./settingsPresentation";

type Props = { route: Route; navigate: (r: Route) => void; back: () => void };
const styles = ["", "Everyday", "Minimal", "Statement"].map((value) => ({
  value,
  label: value || "Not selected",
}));
const fits = ["", "Relaxed", "Regular", "Fitted"].map((value) => ({
  value,
  label: value || "Not selected",
}));
const appearances = [
  { value: "system", label: "Use device setting" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function SettingsScreen({ route, navigate }: Props) {
  return route.name === "owner" ? (
    <Merchant navigate={navigate} />
  ) : route.name === "profile" ? (
    <PersonalProfile navigate={navigate} />
  ) : (
    <Preferences navigate={navigate} route={route} />
  );
}

function Preferences({ navigate, route }: Pick<Props, "navigate" | "route">) {
  const a = useApp();
  const cartCount = a.commerce.cart
    .filter((line) => !route.brandId || line.brandId === route.brandId)
    .reduce((count, line) => count + line.quantity, 0);
  const [preferences, setPreferences] = useState(a.commerce.preferences);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [unfollowing, setUnfollowing] = useState<string[]>([]);
  const saving = useRef(false);
  const sharing = useRef(false);
  const followOperations = useRef(new Set<string>());
  const dirty =
    preferences.style !== a.commerce.preferences.style ||
    preferences.fit !== a.commerce.preferences.fit;
  useEffect(
    () => setPreferences(a.commerce.preferences),
    [a.commerce.preferences],
  );
  const toggle = (name: string) =>
    setExpanded((current) => (current === name ? null : name));
  const updatePreference = (key: "style" | "fit", value: string) => {
    setPreferences((current) => ({ ...current, [key]: value }));
    setMessage("");
    setExpanded(null);
  };
  const save = () => {
    if (saving.current || !dirty) return;
    saving.current = true;
    setBusy(true);
    setMessage("");
    void a
      .dispatch({ type: "preferences", value: preferences })
      .then((ok) =>
        setMessage(
          ok
            ? "Preferences saved on this device."
            : "Preferences were not saved. Check the storage message.",
        ),
      )
      .catch(() => setMessage("Preferences could not be saved."))
      .finally(() => {
        saving.current = false;
        setBusy(false);
      });
  };
  const unfollow = (id: string) => {
    if (followOperations.current.has(id)) return;
    followOperations.current.add(id);
    setUnfollowing([...followOperations.current]);
    void a.toggleFollowed(id).finally(() => {
      followOperations.current.delete(id);
      setUnfollowing([...followOperations.current]);
    });
  };
  return (
    <Screen contentContainerStyle={{ maxWidth: 680, gap: 6 }}>
      <View style={{ gap: 4, paddingTop: 4, paddingBottom: 8 }}>
        <Body>Your account, shopping and preferences.</Body>
      </View>
      <SettingsGroup
        title="Account"
        footer="Account and photo management require configured backend services."
      >
        <SettingsRow
          icon="user"
          label="Sign in or manage account"
          detail="Your account and saved full-body photo"
          onPress={() => navigate({ name: "login" })}
        />
        <SettingsDivider />
        <SettingsRow
          icon="info"
          label="Preview WhatsApp OTP login"
          detail="Simulation only. No messages or accounts."
          onPress={() => navigate({ name: "login-demo" })}
        />
      </SettingsGroup>
      <SettingsGroup title="For brand owners">
        <SettingsRow
          icon="grid"
          label="Brand-owner dashboard"
          detail="Shopify setup · not connected"
          onPress={() => navigate({ name: "owner" })}
        />
      </SettingsGroup>
      <SettingsGroup title="Your shopping">
        <SettingsRow
          icon="shopping-bag"
          label="Demo orders"
          detail="Order history from all stores"
          count={a.commerce.orders.length}
          onPress={() => navigate({ name: "orders" })}
        />
        <SettingsDivider />
        <SettingsRow
          icon="shopping-bag"
          label="Your bag"
          detail={
            route.brandId
              ? "Retained pieces from this store"
              : "Includes retained pieces"
          }
          count={cartCount}
          onPress={() => navigate({ name: "cart" })}
        />
      </SettingsGroup>
      <SettingsGroup title="Appearance">
        <SettingsChoice
          icon="circle"
          label="Theme"
          value={a.themePreference}
          options={appearances}
          open={expanded === "theme"}
          onToggle={() => toggle("theme")}
          onChange={(value) => {
            setExpanded(null);
            void a.setTheme(value as "system" | "light" | "dark");
          }}
        />
      </SettingsGroup>
      <SettingsGroup title="Followed stores">
        {!a.followed.length && (
          <SettingsContent>
            <Body>
              Follow a store to keep it close. Find your favourites in the demo
              directory.
            </Body>
          </SettingsContent>
        )}
        {a.followed.map((id) => {
          const brand = a.brands.find((b) => b.id === id);
          return (
            <React.Fragment key={id}>
              <FollowedStoreRow
                name={
                  brand?.name ||
                  (a.catalogueLoading ? "Loading store…" : "Unavailable store")
                }
                detail={brand ? "View collection" : id}
                onExplore={
                  brand
                    ? () => navigate({ name: "brand", brandId: id })
                    : undefined
                }
                onUnfollow={() => unfollow(id)}
                busy={unfollowing.includes(id)}
              />
              <SettingsDivider />
            </React.Fragment>
          );
        })}
        <SettingsRow
          icon="grid"
          label="Manage demo stores"
          onPress={() => navigate({ name: "stores" })}
        />
      </SettingsGroup>
      <SettingsGroup
        title="Shopping preferences"
        footer="Stored locally. Preferences do not change stock or send notifications."
      >
        <SettingsChoice
          icon="heart"
          label="Favourite style"
          value={preferences.style}
          options={styles}
          open={expanded === "style"}
          disabled={busy}
          onToggle={() => toggle("style")}
          onChange={(value) => updatePreference("style", value)}
        />
        <SettingsDivider />
        <SettingsChoice
          icon="sliders"
          label="Preferred fit"
          value={preferences.fit}
          options={fits}
          open={expanded === "fit"}
          disabled={busy}
          onToggle={() => toggle("fit")}
          onChange={(value) => updatePreference("fit", value)}
        />
        {(dirty || busy || !!message) && (
          <SettingsContent>
            {(dirty || busy) && (
              <Button
                label={busy ? "Saving…" : "Save preferences"}
                disabled={busy}
                onPress={save}
              />
            )}
            <Status
              message={message}
              error={message.includes("not") || message.includes("could")}
            />
          </SettingsContent>
        )}
      </SettingsGroup>
      <SettingsGroup
        title="Device data"
        footer="Clearing app data can remove orders, your bag, follows and preferences. Backups include recovery records, but exclude photo previews and OTP values."
      >
        <SettingsRow
          icon="arrow-down"
          label={exporting ? "Preparing backup…" : "Export local backup"}
          detail="Share a private copy of your shopping records"
          busy={exporting}
          onPress={() => {
            if (sharing.current) return;
            sharing.current = true;
            setExporting(true);
            void a.exportBackup().finally(() => {
              sharing.current = false;
              setExporting(false);
            });
          }}
        />
      </SettingsGroup>
    </Screen>
  );
}

function Merchant({ navigate }: Pick<Props, "navigate">) {
  const p = usePalette();
  const [shop, setShop] = useState("");
  const [checked, setChecked] = useState(false);
  const [blockers, setBlockers] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setBlockers(null);
    setError("");
    void Promise.resolve()
      .then(() =>
        apiFetch("/api/merchant/shopify/readiness", { signal: abort.signal }),
      )
      .then(async (response) => {
        if (!response.ok) throw Error();
        const next = merchantReadinessBlockers(await response.json());
        if (!abort.signal.aborted) setBlockers(next);
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setError(
            "Connection readiness is unavailable. Installation remains blocked.",
          );
      });
    return () => abort.abort();
  }, [retry]);
  const { host, valid } = shopifyDomain(shop);
  const loading = blockers === null && !error;
  return (
    <Screen contentContainerStyle={{ maxWidth: 680 }}>
      <View style={{ gap: 8 }}>
        <Badge>For brands</Badge>
        <Title>Connect your store</Title>
        <Body>
          Bring your brand to Fashion Centre. Secure onboarding is being
          prepared.
        </Body>
      </View>
      <SettingsGroup
        title="Shopify connection"
        footer="No authorization request is sent and no credentials are collected. Demo sign-in does not grant merchant access."
      >
        <SettingsContent>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: "600", color: p.text }}>
              Shopify
            </Text>
            <Text
              style={{
                color: p.accent,
                backgroundColor: p.tint,
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 9,
                fontSize: 13,
                fontWeight: "600",
              }}
            >
              Not connected
            </Text>
          </View>
        </SettingsContent>
        <SettingsDivider />
        <SettingsContent>
          <Field
            label="Store domain"
            value={shop}
            onChangeText={(value) => {
              setShop(value);
              setChecked(false);
            }}
            placeholder="your-brand.myshopify.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            textContentType="URL"
            returnKeyType="done"
            onSubmitEditing={() => setChecked(true)}
          />
          <Body>
            Use your original .myshopify.com domain, not a custom website
            address.
          </Body>
          <Button
            secondary
            label="Check domain format"
            onPress={() => setChecked(true)}
          />
          {checked && (
            <Status
              message={
                valid
                  ? `Domain format valid: ${host}. Ownership has not been verified.`
                  : "Enter a store.myshopify.com domain without https://, a path or a port."
              }
              error={!valid}
            />
          )}
          <Button
            label="Connect Shopify · Setup required"
            disabled
            onPress={() => {}}
          />
        </SettingsContent>
      </SettingsGroup>
      <SettingsGroup
        title="Connection readiness"
        footer="No connected stores, imported products or merchant analytics are available yet."
      >
        <SettingsContent>
          {loading && (
            <View
              accessibilityLiveRegion="polite"
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <ActivityIndicator
                color={p.accent}
                accessibilityLabel="Checking readiness"
              />
              <View style={{ flex: 1 }}>
                <Body>Checking server readiness…</Body>
              </View>
            </View>
          )}
          <Status message={error} error />
          {blockers !== null && (
            <>
              <Text style={{ fontSize: 16, fontWeight: "600", color: p.text }}>
                Setup required
              </Text>
              <Body>
                {blockers.length
                  ? "Installation is blocked until these prerequisites are complete."
                  : "Installation remains blocked. Merchant setup is not available yet."}
              </Body>
              {blockers.map((blocker, index) => (
                <View
                  key={index}
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 10,
                  }}
                >
                  <Text
                    accessibilityLabel={`Step ${index + 1}`}
                    style={{
                      color: p.accent,
                      fontSize: 14,
                      lineHeight: 23,
                      fontWeight: "600",
                    }}
                  >
                    {index + 1}.
                  </Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Body>{blocker}</Body>
                  </View>
                </View>
              ))}
            </>
          )}
        </SettingsContent>
        <SettingsDivider />
        <SettingsRow
          label={
            loading
              ? "Checking readiness…"
              : error
                ? "Retry readiness check"
                : "Refresh readiness"
          }
          busy={loading}
          onPress={() => setRetry((value) => value + 1)}
        />
      </SettingsGroup>
      <SettingsGroup title="Explore Fashion Centre">
        <SettingsRow
          label="Explore demo stores"
          detail="Fictional catalogues. No store authorization."
          onPress={() => navigate({ name: "stores" })}
        />
      </SettingsGroup>
    </Screen>
  );
}
