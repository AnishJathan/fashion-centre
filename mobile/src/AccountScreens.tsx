import { PhotoEditor } from "./photo/PhotoEditor";
import { otpFieldMetrics } from "./photo/layout";
import { useIsFocused } from "@react-navigation/native";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import * as FS from "expo-file-system/legacy";
import { apiFetch, apiUrl } from "./core/api";
import type { Route } from "./navigation";
import { tryOnSession, verifyProfileAccount, type AccountTicket } from "./profileSession";
import { useApp } from "./state";
import {
  Screen,
  Title,
  Body,
  Button,
  Card,
  Field,
  Badge,
  Choices,
  Icon,
  usePalette,
} from "./ui";
import {
  AccountNotice,
  AccountSection,
  ConsentRow,
  PhotoPreview,
  SelectedGarment,
} from "./AccountUI";
import { appendPhoto, inspectFile } from "./photo/native";
import {
  normalisePhone,
  safeGarmentUrl,
  MAX_PHOTO_BYTES,
  resolutionWarning,
} from "./photo/validation";
type Props = {
  route: Route;
  navigate: (route: Route) => void;
  back: () => void;
};
import {
  pendingSubmissions,
  reserveSubmission,
  pollJob,
  validJobId,
} from "./photo/jobs";
const configuredUrl = (path: string) => {
  try {
    return apiUrl(path);
  } catch {
    return "";
  }
};
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";
function Login({ simulation }: { simulation: boolean }) {
  const p = usePalette();
  const { width, fontScale } = useWindowDimensions();
  const [codeFieldWidth, setCodeFieldWidth] = useState(0);
  const codeMetrics = otpFieldMetrics(codeFieldWidth || width - 72, fontScale);
  const [step, setStep] = useState<"phone" | "code" | "account">("phone"),
    [country, setCountry] = useState("+61"),
    [phone, setPhone] = useState(""),
    [sentTo, setSentTo] = useState(""),
    [code, setCode] = useState(""),
    [message, setMessage] = useState(""),
    [messageError, setMessageError] = useState(false),
    [busy, setBusy] = useState(false),
    [expires, setExpires] = useState(0),
    [resend, setResend] = useState(0),
    [now, setNow] = useState(Date.now()),
    [attempts, setAttempts] = useState(0),
    [devCode, setDevCode] = useState("");
  const [photoVersion, setPhotoVersion] = useState(0),
    [photoError, setPhotoError] = useState(false);
  const active = useRef(true),
    inflight = useRef(false),
    abort = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current = true;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    if (!simulation) {
      abort.current = new AbortController();
      void Promise.resolve()
        .then(() => apiFetch("/api/auth/me", { signal: abort.current?.signal }))
        .then((r) => {
          if (r.status === 401) tryOnSession.clear();
          if (active.current && r.ok) setStep("account");
        })
        .catch(() => {});
    }
    return () => {
      active.current = false;
      clearInterval(timer);
      abort.current?.abort();
    };
  }, [simulation]);
  async function action(verify: boolean) {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setMessage("");
    setMessageError(false);
    try {
      const sampleDigits = phone.replace(/[\s()-]/g, "");
      if (simulation && !verify && !/^\d{7,12}$/.test(sampleDigits))
        throw new Error(
          "Enter 7–12 digits without the country code. A sample number is fine.",
        );
      const number = verify
        ? sentTo
        : simulation
          ? country + sampleDigits
          : normalisePhone(country, phone);
      if (verify && (Date.now() >= expires || (attempts >= 3 && simulation)))
        throw new Error(
          "Code expired or too many attempts. Request a new code.",
        );
      if (verify && !/^\d{6}$/.test(code))
        throw new Error("Enter the six-digit code.");
      if (!verify && Date.now() < resend)
        throw new Error("Please wait before requesting another code.");
      let data: {
        expiresInSeconds?: number;
        resendInSeconds?: number;
        devCode?: string;
      } = {};
      if (simulation) {
        if (verify && code !== "123456") {
          setAttempts((n) => n + 1);
          throw new Error("Incorrect demo code. Use 123456.");
        }
      } else {
        abort.current = new AbortController();
        const r = await apiFetch(
          "/api/auth/" + (verify ? "verify-code" : "request-code"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              verify ? { phone: number, code } : { phone: number },
            ),
            signal: abort.current?.signal,
          },
        );
        if (!r.ok)
          throw new Error(
            r.status === 410
              ? "Code expired. Request a new one."
              : r.status === 429
                ? verify
                  ? "Too many attempts. Request a new code."
                  : "Too many requests. Wait before trying again."
                : verify
                  ? "Code not accepted."
                  : "Could not send the code. Check your number and connection.",
          );
        data = await r.json();
        if (verify) tryOnSession.clear();
      }
      if (!active.current) return;
      if (verify) {
        setCode("");
        setStep("account");
      } else {
        const t = Date.now();
        setNow(t);
        setExpires(t + (data.expiresInSeconds ?? 120) * 1000);
        setResend(t + (data.resendInSeconds ?? 30) * 1000);
        setDevCode(data.devCode ?? "");
        setSentTo(number);
        setCode("");
        setAttempts(0);
        setStep("code");
      }
    } catch (e) {
      if (active.current) {
        setMessageError(true);
        setMessage(errorText(e));
      }
    } finally {
      inflight.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function logout() {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setMessage("");
    setMessageError(false);
    try {
      const r = await apiFetch("/api/auth/logout", { method: "POST" });
      if (!r.ok) throw new Error("Could not sign out.");
      tryOnSession.clear();
      if (active.current) {
        setStep("phone");
        setCode("");
        setMessage("Signed out.");
      }
    } catch (e) {
      if (active.current) {
        setMessageError(true);
        setMessage(errorText(e));
      }
    } finally {
      inflight.current = false;
      if (active.current) setBusy(false);
    }
  }
  const remaining = Math.max(0, Math.ceil((expires - now) / 1000)),
    cooldown = Math.max(0, Math.ceil((resend - now) / 1000));
  return (
    <Screen contentContainerStyle={{ maxWidth: 704, gap: 12 }}>
      <View style={{ gap: 6, paddingTop: 4, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: p.line }}>
        <Badge>
          {simulation
            ? "Offline demo"
            : step === "account"
              ? "Your Fashion Centre"
              : "Welcome back"}
        </Badge>
        <Title>
          {simulation
            ? "Try signing in"
            : step === "code"
              ? "Check your WhatsApp"
              : step === "account"
                ? "Your account"
                : "Make it yours"}
        </Title>
        <Body>
          {simulation
            ? "Explore the sign-in flow with a sample number."
            : step === "account"
              ? "Manage your saved photo for your next look."
              : "Sign in with your WhatsApp number. No password to remember."}
        </Body>
      </View>
      {simulation && (
        <AccountNotice
          title="Demo only · No network activity"
          message="No messages, accounts or uploads. Use a sample number and the demo code 123456."
        />
      )}
      {!!message && <AccountNotice message={message} error={messageError} />}
      {step === "phone" && (
        <Card>
          <AccountSection step="Step 1 of 2" title="Your mobile number" />
          <Choices
            label="Country code"
            value={country}
            options={[
              { label: "AU +61", value: "+61" },
              { label: "IN +91", value: "+91" },
              { label: "US / CA +1", value: "+1" },
              { label: "UK +44", value: "+44" },
            ]}
            onChange={(value) => {
              if (!busy) setCountry(value);
            }}
          />
          <Field
            label="WhatsApp number"
            placeholder="Mobile number"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            inputMode="tel"
            autoComplete={simulation ? "off" : "tel-national"}
            textContentType={simulation ? "none" : "telephoneNumber"}
            importantForAutofill={simulation ? "no" : "yes"}
            autoCorrect={false}
            editable={!busy}
            maxLength={18}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (!busy && phone.trim()) void action(false);
            }}
          />
          <Text style={{ color: p.muted, fontSize: 12, lineHeight: 18 }}>
            Use the number registered with WhatsApp, without the country code.
          </Text>
          <Button
            label={
              busy
                ? "Sending code…"
                : simulation
                  ? "Start demo"
                  : "Send WhatsApp code"
            }
            disabled={busy || !phone.trim()}
            busy={busy}
            onPress={() => void action(false)}
          />
          {simulation && (
            <Button
              label="Simulate delivery failure"
              secondary
              disabled={busy}
              onPress={() => {
                setMessageError(true);
                setMessage("Simulated failure. Nothing was sent.");
              }}
            />
          )}
        </Card>
      )}
      {step === "code" && (
        <Card>
          <AccountSection
            step="Step 2 of 2"
            title="Enter your code"
            description={`Code for ${sentTo.slice(0, 3)} •••• ${sentTo.slice(-3)}`}
          />
          {!!devCode && (
            <AccountNotice
              title="Development mode"
              message={`Development code: ${devCode}`}
            />
          )}
          <Field
            label="Six-digit code"
            placeholder="000000"
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, ""))}
            keyboardType="number-pad"
            inputMode="numeric"
            autoComplete={simulation ? "off" : "one-time-code"}
            textContentType={simulation ? "none" : "oneTimeCode"}
            importantForAutofill={simulation ? "no" : "yes"}
            autoCorrect={false}
            editable={!busy}
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (!busy && remaining && code.length === 6) void action(true);
            }}
            onLayout={(event) =>
              setCodeFieldWidth(event.nativeEvent.layout.width)
            }
            style={{
              ...codeMetrics,
              fontVariant: ["tabular-nums"],
              textAlign: "center",
            }}
          />
          <Text
            style={{
              color: remaining ? p.muted : p.error,
              fontSize: 13,
              textAlign: "center",
            }}
          >
            {remaining
              ? `Code expires in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
              : "Code expired. Request a new one below."}
          </Text>
          <Button
            busy={busy}
            label={busy ? "Please wait…" : "Verify code"}
            disabled={busy || remaining === 0 || code.length !== 6}
            onPress={() => void action(true)}
          />
          <Button
            label={cooldown ? `Resend code in ${cooldown}s` : "Resend code"}
            disabled={busy || cooldown > 0}
            secondary
            onPress={() => void action(false)}
          />
          <Button
            label="Use a different number"
            disabled={busy}
            secondary
            onPress={() => {
              setStep("phone");
              setCode("");
              setMessage("");
              setMessageError(false);
            }}
          />
          {simulation && (
            <Button
              label="Simulate expiry"
              secondary
              disabled={busy}
              onPress={() => {
                setExpires(0);
                setResend(0);
              }}
            />
          )}
        </Card>
      )}
      {step === "account" &&
        (simulation ? (
          <Card>
            <AccountSection
              step="Demo complete"
              title="You’re all set"
              description="No authenticated session exists. Local favourites remain on this device."
            />
            <Button
              label="Restart demo"
              onPress={() => {
                setStep("phone");
                setCode("");
                setResend(0);
                setMessage("");
                setMessageError(false);
              }}
            />
          </Card>
        ) : (
          <>
            <Card>
              <AccountSection
                step="Signed in"
                title="Your saved photo"
                description="This is the photo used for saved-photo try-on."
              />
              {!photoError ? (
                <PhotoPreview
                  compact
                  key={photoVersion}
                  source={{
                    uri: configuredUrl("/api/users/me/photo?v=" + photoVersion),
                    cache: "reload",
                  }}
                  onError={() => setPhotoError(true)}
                  onLoad={() => setPhotoError(false)}
                  label="Saved account photo if available"
                />
              ) : (
                <>
                  <AccountNotice message="No saved photo could be loaded. Add one below, or check your session and connection." />
                  <Button
                    label="Retry saved photo"
                    secondary
                    onPress={() => {
                      setPhotoError(false);
                      setPhotoVersion((v) => v + 1);
                    }}
                  />
                </>
              )}
            </Card>
            <PhotoEditor
              upload
              onSaved={() => {
                setPhotoError(false);
                setPhotoVersion((v) => v + 1);
              }}
            />
            <Button
              busy={busy}
              label={busy ? "Signing out…" : "Sign out"}
              disabled={busy}
              secondary
              onPress={() => void logout()}
            />
          </>
        ))}
      {!simulation && step !== "account" && (
        <Text
          style={{
            color: p.muted,
            fontSize: 12,
            lineHeight: 18,
            textAlign: "center",
          }}
        >
          Your session is handled by the native network stack. Session cookies
          are never copied into local app storage.
        </Text>
      )}
    </Screen>
  );
}
function SavedTryOn({ route, navigate }: Props) {
  const { products } = useApp();
  const p = usePalette();
  const product = products.find((p) => p.id === route.productId && (!route.brandId || p.brandId === route.brandId));
  let garmentUri = "";
  if (product) {
    try {
      garmentUri = safeGarmentUrl(product.image, product.image.startsWith("/") ? new URL(apiUrl("/")).origin : "");
    } catch {}
  }
  const [ready, setReady] = useState(false),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("Checking your account and saved photo…"),
    [statusError, setStatusError] = useState(false),
    [checking, setChecking] = useState(true),
    [previewVersion, setPreviewVersion] = useState(0),
    [previewError, setPreviewError] = useState(false),
    [result, setResult] = useState("");
  const [prerequisite, setPrerequisite] = useState<"sign-in" | "photo" | null>(null);
  const [checkVersion, setCheckVersion] = useState(0);
  const accountTicket = useRef<AccountTicket | null>(null);
  const alive = useRef(true),
    submitted = useRef(false),
    abort = useRef(new AbortController()),
    download = useRef<ReturnType<typeof FS.createDownloadResumable> | null>(
      null,
    ),
    temporary = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    alive.current = true;
    const checkAbort = new AbortController();
    abort.current = checkAbort;
    accountTicket.current = null;
    setReady(false);
    setConsent(false);
    setChecking(true);
    setPrerequisite(null);
    setStatusError(false);
    setMessage("Checking your account and saved photo…");
    void Promise.resolve()
      .then(() => verifyProfileAccount(
        () => apiFetch("/api/auth/me", { signal: checkAbort.signal, cache: "no-store" }),
        () => active && alive.current && !checkAbort.signal.aborted,
      ))
      .then(async (verified) => {
        if (!active || !alive.current || checkAbort.signal.aborted) return;
        if (!verified) {
          setPrerequisite("sign-in");
          setMessage("");
          return;
        }
        accountTicket.current = verified.ticket;
        const photo = await apiFetch("/api/users/me/photo", {
          method: "HEAD",
          signal: checkAbort.signal,
        });
        if (!active || !alive.current || checkAbort.signal.aborted) return;
        if (!tryOnSession.current(verified.ticket))
          throw new Error("Your account changed. Check your account again to continue.");
        if (photo.status === 401) {
          tryOnSession.clear();
          setPrerequisite("sign-in");
          setMessage("");
          return;
        }
        if (photo.status === 404) {
          setPrerequisite("photo");
          setMessage("");
          return;
        }
        if (!photo.ok) throw new Error("We couldn’t check your saved photo. Please try again.");
        setReady(true);
        setMessage("");
      })
      .catch((e) => {
        if (active && alive.current) {
          setStatusError(true);
          setMessage(errorText(e));
        }
      })
      .finally(() => {
        if (active && alive.current) setChecking(false);
      });
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") {
        active = false;
        abort.current.abort();
        void download.current?.cancelAsync();
        if (alive.current) {
          accountTicket.current = null;
          setReady(false);
          setConsent(false);
          setResult("");
          setChecking(false);
          setPrerequisite(null);
          setStatusError(false);
          setBusy(false);
          setMessage(
            "Your photo is hidden while try-on is paused. Retry the account check to continue. An already submitted job may still run; this check will not submit another generation.",
          );
        }
        alive.current = false;
      }
    });
    return () => {
      active = false;
      alive.current = false;
      abort.current.abort();
      void download.current?.cancelAsync();
      if (temporary.current)
        void FS.deleteAsync(temporary.current, { idempotent: true }).catch(
          () => {},
        );
      sub.remove();
    };
  }, [checkVersion]);
  async function run() {
    if (!product || !ready || !consent || submitted.current || !alive.current)
      return;
    if (!reserveSubmission(product.id)) return;
    let postBegan = false;
    let terminal = false;
    submitted.current = true;
    abort.current = new AbortController();
    setResult("");
    setStatusError(false);
    setPreviewError(false);
    setBusy(true);
    setMessage("Preparing garment…");
    const totalTimeout = setTimeout(() => {
      abort.current.abort();
      void download.current?.cancelAsync();
    }, 120000);
    try {
      const verified = await verifyProfileAccount(
        () => apiFetch("/api/auth/me", { signal: abort.current.signal, cache: "no-store" }),
        () => alive.current && !abort.current.signal.aborted,
      );
      if (!verified || !accountTicket.current || !tryOnSession.current(accountTicket.current) ||
          verified.account.id !== accountTicket.current.accountId)
        throw new Error("Your account changed. Reopen try-on and review your saved photo.");
      const ticket = accountTicket.current;
      const uri = safeGarmentUrl(product.image, new URL(apiUrl("/")).origin);
      if (!FS.cacheDirectory)
        throw new Error("Temporary file storage is unavailable.");
      const target = FS.cacheDirectory + "garment-" + Date.now() + ".image";
      temporary.current = target;
      let exceeded = false;
      download.current = FS.createDownloadResumable(
        uri,
        target,
        {},
        (progress: {
          totalBytesWritten: number;
          totalBytesExpectedToWrite: number;
        }) => {
          if (
            progress.totalBytesWritten > MAX_PHOTO_BYTES ||
            progress.totalBytesExpectedToWrite > MAX_PHOTO_BYTES
          ) {
            exceeded = true;
            void download.current?.cancelAsync();
          }
        },
      );
      const file = await download.current.downloadAsync();
      if (exceeded || !file || file.status !== 200)
        throw new Error("Could not load a bounded garment image.");
      const rawHeader = Object.entries(file.headers).find(
        ([k]) => k.toLowerCase() === "content-type",
      )?.[1];
      const header =
        typeof rawHeader === "string" ? rawHeader.split(";")[0] : "";
      await inspectFile(target, header);
      if (!alive.current) return;
      if (!tryOnSession.current(ticket))
        throw new Error("Your account changed. Reopen try-on before sending images.");
      const form = new FormData();
      appendPhoto(form, "garment", {
        uri: target,
        name:
          "garment." +
          (header === "image/png"
            ? "png"
            : header === "image/webp"
              ? "webp"
              : "jpg"),
        type: header,
      });
      setMessage("Submitting one try-on request…");
      postBegan = true;
      const start = await apiFetch("/api/try-on/me", {
        method: "POST",
        body: form,
        signal: abort.current?.signal,
      });
      if (start.status === 401 || start.status === 409) postBegan = false;
      if (start.status === 401) tryOnSession.clear();
      if (!start.ok)
        throw new Error(
          start.status === 401
            ? "Session expired. Sign in again."
            : start.status === 409
              ? "Save your full-body photo first."
              : "Try-on submission was not accepted.",
        );
      const job = (await start.json()) as {
        id?: string;
      };
      if (!validJobId(job.id))
        throw new Error(
          "Invalid job response. Do not submit again until the outcome is confirmed.",
        );
      setMessage(
        "Your look is being generated. Keep this screen open to follow its progress.",
      );
      const timeout = setTimeout(() => abort.current.abort(), 90000);
      try {
        const outcome = await pollJob({
          id: job.id,
          active: () => alive.current,
          read: (path) => apiFetch(path, { signal: abort.current?.signal }),
        });
        if (outcome === "stopped") return;
        if (outcome === "succeeded") {
          pendingSubmissions.delete(product.id);
          terminal = true;
          const currentAccount = await verifyProfileAccount(
            () => apiFetch("/api/auth/me", { signal: abort.current.signal, cache: "no-store" }),
            () => alive.current && !abort.current.signal.aborted,
          );
          if (!currentAccount || !tryOnSession.current(ticket) || currentAccount.account.id !== ticket.accountId)
            throw new Error("Your account changed. The completed result is hidden.");
          tryOnSession.recordSucceeded(ticket, {
            jobId: job.id,
            productId: product.id,
            productName: product.name,
            brandName: product.brandName,
            completedAt: Date.now(),
          });
          setResult(
            apiUrl("/api/try-on/" + encodeURIComponent(job.id) + "/result"),
          );
          setMessage(
            "Generated illustration, not a guarantee of size or physical fit.",
          );
          return;
        }
        if (outcome === "failed") {
          pendingSubmissions.delete(product.id);
          terminal = true;
          throw new Error("Try-on did not complete.");
        }
        throw new Error(
          "Polling timed out. The job may still run; no automatic resubmission was made.",
        );
      } finally {
        clearTimeout(timeout);
      }
    } catch (e) {
      if (alive.current) {
        setStatusError(true);
        setMessage(errorText(e) + " No automatic retry was made.");
      }
    } finally {
      clearTimeout(totalTimeout);
      if (!postBegan) {
        pendingSubmissions.delete(product.id);
      }
      if (temporary.current) {
        await FS.deleteAsync(temporary.current, { idempotent: true }).catch(
          () => {},
        );
        temporary.current = null;
      }
      if (!postBegan || terminal) submitted.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <Screen contentContainerStyle={{ maxWidth: 704, gap: 12 }}>
      {product ? (
        <SelectedGarment name={product.name} brand={product.brandName} uri={garmentUri} />
      ) : (
        <Card>
          <AccountSection title="Choose a piece to try on" description="Start with a garment from the catalogue, then add your photo." />
          <Button label="Choose a garment" icon="image" onPress={() => navigate({ name: "prepare", brandId: route.brandId })} />
        </Card>
      )}
      {!!product && !ready && (
        <Card>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 16, backgroundColor: p.tint, alignItems: "center", justifyContent: "center" }}>
              <Icon name={prerequisite === "photo" ? "camera" : "user"} size={18} color={p.accent} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text accessibilityRole="header" style={{ color: p.text, fontSize: 16, lineHeight: 22, fontWeight: "700" }}>
                {checking ? "Getting your try-on ready" : prerequisite === "sign-in" ? "See it on you" : prerequisite === "photo" ? "Add your full-body photo" : "Let’s check your account"}
              </Text>
              <Text style={{ color: p.muted, fontSize: 13, lineHeight: 19 }}>
                {checking ? "We’ll check for a saved photo before you continue." : prerequisite === "sign-in" ? "Sign in, save a photo, then try this piece on. You’ll review and confirm before anything is generated." : prerequisite === "photo" ? "Save a clear, full-body photo in your account. You’ll review it here before generating a look." : "Your photo is hidden until we can verify your account and saved photo."}
              </Text>
            </View>
          </View>
          {checking ? (
            <AccountNotice compact busy message="Checking account and photo…" />
          ) : prerequisite ? (
            <Button label={prerequisite === "sign-in" ? "Sign in to continue" : "Add an account photo"} onPress={() => navigate({ name: "login" })} />
          ) : (
            <>
              <AccountNotice compact error={statusError} message={message} />
              <Button label="Retry account check" onPress={() => setCheckVersion((value) => value + 1)} />
              <Button label="Open account" secondary onPress={() => navigate({ name: "login" })} />
            </>
          )}
        </Card>
      )}
      {!!product && !ready && !checking && (
        <View style={{ gap: 4 }}>
          <Button label="Prepare a photo locally" secondary icon="camera" onPress={() => navigate({ name: "prepare", productId: product.id, brandId: route.brandId })} />
          <Text style={{ color: p.muted, fontSize: 12, lineHeight: 18, textAlign: "center" }}>Camera preparation only. Nothing is uploaded or generated.</Text>
        </View>
      )}
      {!!product && ready && (
        <>
          {(busy || statusError) && <AccountNotice compact message={message} error={statusError} busy={busy} />}
          <Card>
            <AccountSection title={result ? "Your generated look" : "Review your saved photo"} description={result ? "Generated illustration, not a guarantee of size or physical fit." : "This is the photo that will be used for your try-on."} />
            {!previewError ? (
              <PhotoPreview
                compact={!result}
                key={`${result}:${previewVersion}`}
                source={{ uri: result || configuredUrl("/api/users/me/photo"), cache: "reload" }}
                label={result ? "Generated try-on result" : "Saved account photo"}
                onError={() => setPreviewError(true)}
              />
            ) : (
              <>
                <AccountNotice compact error message="The preview could not load. Retrying the image will not submit a new generation." />
                <Button label="Reload preview" secondary onPress={() => { setPreviewError(false); setPreviewVersion((value) => value + 1); }} />
              </>
            )}
          </Card>
          <Card>
            <AccountSection title="Confirm before generating" />
            <Body>
              Your saved photo and this garment are sent through Fashion Centre
              to its configured provider (the existing backend uses Pruna).
              Processing may incur service charges. Review the service’s current
              pricing, privacy and retention terms first.
            </Body>
            <ConsentRow
              checked={consent}
              onChange={setConsent}
              disabled={busy}
              label="I have permission to use these images and consent to sending my saved photo and this garment to the configured provider for this generation."
            />
            <Button
              busy={busy}
              label={busy ? "Generating…" : result ? "Generate another look" : "Generate with saved photo"}
              disabled={!product || !ready || !consent || busy || submitted.current || pendingSubmissions.has(product.id)}
              onPress={() => {
                const reviewedAccount = accountTicket.current;
                Alert.alert(
                  "Send images for try-on?",
                  "Send your saved account photo and this garment to the configured provider. This may incur service charges. Leaving this screen stops polling, not a provider job already started.",
                  [{ text: "Cancel", style: "cancel" }, { text: "Generate once", onPress: () => {
                    if (reviewedAccount && reviewedAccount === accountTicket.current && alive.current) void run();
                  } }],
                );
              }}
            />
            {!busy && pendingSubmissions.has(product.id) && (
              <AccountNotice compact title="Submission protected" message="An earlier submission has an unknown outcome. Check the service before trying again; this garment stays blocked for this app session." />
            )}
          </Card>
          <Text style={{ color: p.muted, fontSize: 12, lineHeight: 18 }}>
            Leaving stops progress checks, not a job already started. Try again only
            after a confirmed result or failure. Uncertain submissions block this
            garment for the app session. Live provider billing, privacy and native
            cookie compatibility have not been verified by this port.
          </Text>
        </>
      )}
    </Screen>
  );
}
function ActiveAccountScreen(props: Props) {
  const { route, navigate } = props;
  const { products } = useApp();
  const p = usePalette();
  const scopedProducts = products.filter(
    (p) => !route.brandId || p.brandId === route.brandId,
  );
  const product = scopedProducts.find((p) => p.id === route.productId);
  let garmentUri = "";
  if (product) {
    try {
      garmentUri = safeGarmentUrl(
        product.image,
        product.image.startsWith("/") ? new URL(apiUrl("/")).origin : "",
      );
    } catch {}
  }
  const [inspectedGarment, setInspectedGarment] = useState<{
    productId: string;
    image: string;
    width: number;
    height: number;
  } | null>(null);
  const [garmentFailure, setGarmentFailure] = useState<{
    productId: string;
    image: string;
    message: string;
  } | null>(null);
  const [inspectionVersion, setInspectionVersion] = useState(0);
  const garmentInfo =
    inspectedGarment?.productId === product?.id &&
    inspectedGarment?.image === product?.image
      ? inspectedGarment
      : null;
  const garmentError =
    garmentFailure &&
    garmentFailure.productId === product?.id &&
    garmentFailure.image === product?.image
      ? garmentFailure.message
      : "";
  useEffect(() => {
    let active = true;
    setInspectedGarment(null);
    setGarmentFailure(null);
    if (route.name !== "prepare" || !product) return;
    const fail = () => {
      if (active)
        setGarmentFailure({
          productId: product.id,
          image: product.image,
          message:
            "The garment image could not load. Check your connection or choose another garment.",
        });
    };
    try {
      const origin = product.image.startsWith("/")
        ? new URL(apiUrl("/")).origin
        : "";
      const uri = safeGarmentUrl(product.image, origin);
      Image.getSize(
        uri,
        (width, height) => {
          if (!active) return;
          if (
            !Number.isFinite(width) ||
            !Number.isFinite(height) ||
            width <= 0 ||
            height <= 0
          ) {
            fail();
            return;
          }
          setInspectedGarment({
            productId: product.id,
            image: product.image,
            width,
            height,
          });
        },
        fail,
      );
    } catch {
      fail();
    }
    return () => {
      active = false;
    };
  }, [route.name, product?.id, product?.image, inspectionVersion]);
  if (route.name === "login" || route.name === "login-demo")
    return <Login key={route.name} simulation={route.name === "login-demo"} />;
  if (route.name === "try-on")
    return <SavedTryOn key={route.productId} {...props} />;
  return (
    <Screen contentContainerStyle={{ maxWidth: 704, gap: 12 }}>
      <View style={{ gap: 6, paddingTop: 4, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: p.line }}>
        <Badge>Local photo studio</Badge>
        <Title>Prepare your next look</Title>
        <Body>
          Pair a garment with your photo. Nothing is uploaded or generated here.
        </Body>
        <View accessibilityLabel="Photo preparation: choose a piece, prepare your photo, review locally" style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, paddingTop: 2 }}>
          {["01 / Choose", "02 / Prepare", "03 / Review"].map((label) => (
            <Text key={label} style={{ color: p.accent, fontSize: 11, lineHeight: 16, fontWeight: "600" }}>{label}</Text>
          ))}
        </View>
      </View>
      <Card>
        <AccountSection
          step="Step 1 · The garment"
          title="Choose your piece"
          description="Select a catalogue reference for your local preview."
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
        >
          {scopedProducts.map((item) => {
            const selected = item.id === product?.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`${item.brandName}, ${item.name}`}
                accessibilityState={{ selected }}
                onPress={() =>
                  navigate({
                    name: "prepare",
                    productId: item.id,
                    brandId: route.brandId,
                  })
                }
                style={({ pressed }) => ({
                  width: 144,
                  minHeight: 64,
                  padding: 10,
                  borderRadius: 12,
                  gap: 4,
                  borderWidth: 1,
                  borderColor: selected ? p.accent : p.line,
                  backgroundColor: selected ? p.tint : p.surface,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text
                  style={{
                    color: selected ? p.accent : p.muted,
                    fontSize: 11,
                    lineHeight: 16,
                    fontWeight: "700",
                  }}
                >
                  {selected ? "✓ SELECTED" : item.brandName}
                </Text>
                <Text
                  style={{
                    color: p.text,
                    fontSize: 14,
                    lineHeight: 20,
                    fontWeight: "600",
                  }}
                >
                  {item.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {!scopedProducts.length && (
          <AccountNotice
            title="No garments available"
            message="Enable this store’s catalogue to prepare a look."
          />
        )}
        {product && (
          <>
            <AccountSection
              title={product.name}
              description={product.brandName}
            />
            {!!garmentUri && !garmentError && (
              <PhotoPreview
                key={product.id + ":" + inspectionVersion}
                compact
                source={{ uri: garmentUri }}
                label={"Garment reference: " + product.name}
                onError={() => {
                  setInspectedGarment(null);
                  setGarmentFailure({
                    productId: product.id,
                    image: product.image,
                    message:
                      "The garment preview could not load. Retry or choose another garment before reviewing.",
                  });
                }}
              />
            )}
            {garmentInfo && (
              <>
                <Text
                  style={{ color: p.muted, fontSize: 12, textAlign: "center" }}
                >
                  Reference image · {garmentInfo.width} × {garmentInfo.height}{" "}
                  pixels
                </Text>
                {!!resolutionWarning(garmentInfo.width, garmentInfo.height) && (
                  <AccountNotice
                    message={resolutionWarning(
                      garmentInfo.width,
                      garmentInfo.height,
                    )}
                  />
                )}
              </>
            )}
            {!!garmentError && (
              <>
                <AccountNotice message={garmentError} error />
                <Button
                  label="Retry garment check"
                  secondary
                  onPress={() => setInspectionVersion((v) => v + 1)}
                />
              </>
            )}
            {!garmentInfo && !garmentError && (
              <AccountNotice
                busy
                message="Checking garment image dimensions…"
              />
            )}
            <Text style={{ color: p.muted, fontSize: 12, lineHeight: 18 }}>
              One catalogue reference is supplied. No extra detail or
              higher-resolution image is invented. Choose a clear, unobstructed
              garment in good light.
            </Text>
          </>
        )}
      </Card>
      {product && (
        <>
          <PhotoEditor
            key={product.id}
            garmentReady={!!garmentInfo && !garmentError}
          />
          <Card>
            <AccountSection
              title="Want to generate a try-on?"
              description="Use a photo saved in your account. Upload and generation each require separate consent."
            />
            <Button
              label="Open saved-photo try-on"
              secondary
              onPress={() =>
                navigate({
                  name: "try-on",
                  productId: product.id,
                  brandId: route.brandId,
                })
              }
            />
          </Card>
        </>
      )}
    </Screen>
  );
}
/** Native stacks retain blurred routes: explicitly unmount transient photos and requests. */
export function AccountScreen(props: Props) {
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => subscription.remove();
  }, []);
  // Do not unmount camera/library pickers for their native activity transitions.
  if (!focused || (props.route.name === "try-on" && !foreground))
    return (
      <Screen>
        <Body>
          Try-on paused. An already submitted provider job may continue.
        </Body>
      </Screen>
    );
  return <ActiveAccountScreen {...props} />;
}
