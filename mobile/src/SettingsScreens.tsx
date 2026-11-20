import React, { useEffect, useRef, useState } from "react";
import { Text } from "./Typography";
import { ActivityIndicator, View } from "react-native";
import { useApp } from "./state";
import type { Route } from "./navigation";
import { browserSignIn } from "./core/browserSignIn";
import { merchantSession } from "./core/providerSignIn";
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
          detail="Shopify sign-in and store setup"
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
  const [publication,setPublication]=useState<boolean|null>(null);
  const app=useApp();
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
        const data=await response.json();
        if(!abort.signal.aborted)setPublication(data.marketplace===true ? !!data.published : null);
        const next = data.marketplace===true ? [] : merchantReadinessBlockers(data);
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
  const [activeShop, setActiveShop] = useState("");
  const [busy, setBusy] = useState(false), [authError, setAuthError] = useState("");
  const pending = useRef(false), mounted = useRef(true), initial = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    mounted.current = true;
    initial.current = controller;
    void merchantSession(apiFetch, controller.signal)
      .then(value => { if (!controller.signal.aborted) setActiveShop(value); })
      .catch(() => { if (!controller.signal.aborted) setAuthError("Couldn’t check your merchant session. Please try again."); });
    return () => { mounted.current = false; controller.abort(); };
  }, []);
  async function merchantAuth() {
    if (pending.current) return;
    setAuthError("");
    if (!activeShop) { setChecked(true); if (!valid) return; }
    pending.current = true;
    setBusy(true);
    initial.current?.abort();
    try {
      if (activeShop) {
        const response = await apiFetch("/api/auth/sign-in/shopify/logout", {method:"POST"});
        if (!response.ok) throw Error("Couldn’t sign out. Please try again.");
        if (mounted.current) { setActiveShop(""); setChecked(false); }
      } else {
        await browserSignIn("shopify", host);
        const authenticated = await merchantSession(apiFetch);
        if (authenticated !== host) throw Error("Couldn’t confirm your merchant session. Please sign in again.");
        if (mounted.current) setActiveShop(authenticated);
      }
    } catch (cause) {
      if (mounted.current) setAuthError(cause instanceof Error ? cause.message : "Couldn’t complete merchant sign-in.");
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const { host, valid } = shopifyDomain(shop);
  const loading = blockers === null && !error;
  return (
    <Screen contentContainerStyle={{ maxWidth: 680 }}>
      <View style={{ gap: 8 }}>
        <Badge>For brands</Badge>
        <Title>Your merchant account</Title>
        <Body>Sign in with your Shopify store to access Fashion Centre for brands.</Body>
      </View>
      <SettingsGroup title="Merchant sign-in">
        <SettingsContent>
          {activeShop ? <Body>Signed in to {activeShop}</Body> : <>
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
              editable={!busy}
              onSubmitEditing={merchantAuth}
            />
            <Body>
              Use your original .myshopify.com domain.
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
          </>}
          <Button label={activeShop ? "Sign out of merchant account" : "Sign in with Shopify"} busy={busy} onPress={merchantAuth}/>
          {!!authError && <Status message={authError} error/>}
        </SettingsContent>
      </SettingsGroup>
      {publication!==null ? <SettingsGroup title="Your storefront"><SettingsContent>
        <Body>{publication ? "Your collection is visible to shoppers." : "Publish your Shopify collection to open your store."}</Body>
        {!!activeShop && <Button label={publication ? "Unpublish store" : "Publish store"} disabled={busy} onPress={async()=>{
          setBusy(true);setAuthError("");
          try {const r=await apiFetch("/api/merchant/shopify/publish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({published:!publication})});
            if(!r.ok)throw Error();setRetry(n=>n+1);void app.reload();
          }catch{setAuthError("Couldn’t update your storefront. Check its Shopify permissions and retry.");}finally{setBusy(false);}
        }}/>}
      </SettingsContent></SettingsGroup> : <SettingsGroup
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
          <Button label="Connect Shopify · Setup required" disabled onPress={() => {}}/>
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
      </SettingsGroup>}
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
