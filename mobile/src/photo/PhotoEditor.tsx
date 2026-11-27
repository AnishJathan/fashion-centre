import { preparationReady } from "./preparation";
import React, { useEffect, useRef, useState } from "react";
import { Text } from "../Typography";
import { Alert, View } from "react-native";
import { apiFetch } from "../core/api";
import { metrics } from "../design";
import { Body, Button, Card, Icon, usePalette } from "../ui";
import {
  AccountNotice,
  AccountSection,
  ConsentRow,
  PhotoPreview,
} from "../AccountUI";
import { appendPhoto, takePhoto, discard, type LocalPhoto } from "./native";
import {
  hasNativeVision,
  requireGoodPhoto,
  visionUnavailableMessage,
} from "./vision";
import { CameraScanner } from "./CameraScanner";

export function PhotoEditor({
  upload = false,
  onSaved,
  garmentReady = false,
}: {
  upload?: boolean;
  onSaved?: () => void;
  garmentReady?: boolean;
}) {
  const p = usePalette(),
    [photo, setPhoto] = useState<LocalPhoto | null>(null),
    [message, setMessage] = useState(""),
    [messageError, setMessageError] = useState(false),
    [busyLabel, setBusyLabel] = useState("Checking your photo…"),
    [busy, setBusy] = useState(false),
    [rights, setRights] = useState(false),
    [understood, setUnderstood] = useState(false),
    [review, setReview] = useState(false),
    [scanning, setScanning] = useState(false);
  const alive = useRef(true),
    working = useRef(false),
    current = useRef<LocalPhoto | null>(null),
    epoch = useRef(0),
    controller = useRef<AbortController | null>(null);
  function clear() {
    epoch.current++;
    void discard(current.current);
    current.current = null;
    setPhoto(null);
    setRights(false);
    setUnderstood(false);
    setReview(false);
    setMessage("");
    setMessageError(false);
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      epoch.current++;
      controller.current?.abort();
      void discard(current.current);
    };
  }, []);
  useEffect(() => {
    if (!garmentReady) setReview(false);
  }, [garmentReady]);
  async function capture() {
    if (!alive.current || working.current) return;
    working.current = true;
    clear();
    const token = epoch.current;
    setBusy(true);
    setBusyLabel("Opening and checking your photo…");
    setMessage("");
    let next: LocalPhoto | null = null;
    try {
      next = await takePhoto("camera");
      if (!alive.current || token !== epoch.current) return;
      current.current = next;
      setPhoto(next);
      next = null;
    } catch (e) {
      if (alive.current && token === epoch.current) {
        setMessageError(true);
        setMessage(
          e instanceof Error ? e.message : "Could not inspect the photo.",
        );
      }
    } finally {
      await discard(next);
      working.current = false;
      if (alive.current && token === epoch.current) setBusy(false);
    }
  }
  async function save() {
    if (!alive.current || !photo || !rights || working.current) return;
    working.current = true;
    setBusy(true);
    setBusyLabel("Checking and saving your scan…");
    setMessage("");
    setMessageError(false);
    const token = epoch.current;
    controller.current = new AbortController();
    try {
      await requireGoodPhoto(photo.uri);
      if (!alive.current || token !== epoch.current) return;
      const form = new FormData();
      appendPhoto(form, "file", photo);
      const res = await apiFetch("/api/users/me/photo", {
        method: "POST",
        body: form,
        signal: controller.current.signal,
      });
      if (!res.ok)
        throw new Error(
          res.status === 401
            ? "Your session expired. Sign in again."
            : "Could not save your scan.",
        );
      if (alive.current && token === epoch.current) {
        clear();
        setBusy(false);
        setMessage("Scan saved to your account.");
        onSaved?.();
      }
    } catch (e) {
      if (alive.current && token === epoch.current) {
        setMessageError(true);
        setMessage(e instanceof Error ? e.message : "Scan upload failed.");
      }
    } finally {
      working.current = false;
      if (alive.current && token === epoch.current) setBusy(false);
    }
  }
  const canReview = upload
    ? !!photo && rights
    : preparationReady({
        photo: !!photo,
        garment: garmentReady,
        rights,
        understood,
      });
  return (
    <Card>
      <AccountSection
        step={upload ? "Full-body scan" : "Step 2 · Your photo"}
        title={
          photo
            ? upload
              ? "Review your scan"
              : "Review your photo"
            : upload
              ? "Scan your full body"
              : "Add a full-body photo"
        }
        description={upload
          ? "Stand 2–3 steps back in even light, with your head and feet visible."
          : "Take an upright photo with your head and feet visible, in clear, even light."}
      />
      {!upload && (
        <Text style={{ color: p.muted, fontSize: 12, lineHeight: 18 }}>
          JPEG, PNG or WebP · Up to 10 MiB · Up to 40 megapixels
        </Text>
      )}
      {upload && !hasNativeVision && (
        <AccountNotice
          title="Scanner unavailable"
          message={visionUnavailableMessage}
        />
      )}
      {scanning ? (
        <CameraScanner
          onCancel={() => setScanning(false)}
          onAccepted={(next) => {
            if (!alive.current) {
              void discard(next);
              return;
            }
            current.current = next;
            setPhoto(next);
            setScanning(false);
            setMessageError(false);
            setMessage(
              "Photo passed the on-device checks. Review it before saving.",
            );
          }}
        />
      ) : (
        <>
          {!photo && !busy && (
            <View
              style={{
                padding: metrics.gap,
                gap: metrics.compactGap,
                alignItems: "center",
                backgroundColor: p.tint,
                borderRadius: metrics.cardRadius,
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: p.line,
              }}
            >
              <Icon name="camera" size={22} color={p.accent} />
              <Text
                style={{
                  color: p.text,
                  fontSize: 14,
                  lineHeight: 20,
                  fontWeight: "600",
                  textAlign: "center",
                }}
              >
                {upload ? "Your scan goes here" : "Your photo goes here"}
              </Text>
              <Text
                style={{
                  color: p.muted,
                  fontSize: 13,
                  lineHeight: 19,
                  textAlign: "center",
                }}
              >
                {upload
                  ? "Your scan is checked on this device before you save it."
                  : "Your photo stays on this device."}
              </Text>
            </View>
          )}
          {upload ? (
            <Button
              secondary
              label="Scan full body automatically"
              icon="camera"
              disabled={busy || !hasNativeVision}
              onPress={() => {
                clear();
                setScanning(true);
              }}
            />
          ) : (
            <Button
              secondary
              icon="camera"
              label="Take a photo"
              disabled={busy}
              onPress={() => void capture()}
            />
          )}
        </>
      )}
      {busy && <AccountNotice busy message={busyLabel} />}
      {!!message && <AccountNotice message={message} error={messageError} />}
      {photo && !scanning && (
        <>
          <PhotoPreview
            compact
            source={{ uri: photo.uri }}
            label={upload ? "Scanned full-body photo" : "Selected local full-body photo"}
          />
          <Text style={{ color: p.muted, fontSize: 12, textAlign: "center" }}>
            {photo.width} × {photo.height} pixels · Local preview
          </Text>
          {!!photo.warning && <AccountNotice message={photo.warning} />}
          <ConsentRow
            checked={rights}
            disabled={busy}
            onChange={(value) => {
              setRights(value);
              setReview(false);
            }}
            label={
              upload
                ? "I have permission to use this scan and agree to save it to my account on the configured Fashion Centre server."
                : "I have permission to use both my personal photo and the garment image."
            }
          />
          {!upload && (
            <ConsentRow
              checked={understood}
              disabled={busy}
              onChange={(value) => {
                setUnderstood(value);
                setReview(false);
              }}
              label="I understand this is only a local preview. Any future upload or generation requires separate consent."
            />
          )}
          {!upload && !garmentReady && (
            <AccountNotice message="A usable garment image must load before this preparation can be reviewed." />
          )}
          <Button
            label={
              busy
                ? "Please wait…"
                : upload
                  ? "Save scan to account"
                  : "Review local preparation"
            }
            disabled={busy || !canReview}
            busy={busy}
            onPress={() =>
              upload
                ? Alert.alert(
                    "Save scan to account?",
                    "Send this scan to the configured Fashion Centre backend and its R2/S3-compatible account storage for future try-on. Review the service privacy and retention terms before proceeding.",
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: "Save scan", onPress: () => void save() },
                    ],
                  )
                : setReview(true)
            }
          />
          <Button
            secondary
            label={upload ? "Discard scan" : "Remove local photo"}
            disabled={busy}
            onPress={clear}
          />
        </>
      )}
      {review && (
        <AccountNotice
          title="Preparation reviewed"
          message="Nothing was uploaded or generated. This preview is local to your device."
        />
      )}
      {!scanning && (
        <View style={{ gap: metrics.compactGap, paddingTop: 4 }}>
          <Body>
            {upload
              ? "Scans are checked on this device for pose, brightness and sharpness before anything is saved."
              : "File type, size and dimensions are checked locally. Preparing a photo does not upload it or generate a result."}
          </Body>
          <Text style={{ color: p.muted, fontSize: 12, lineHeight: 18 }}>
            {upload
              ? "Retaking or discarding clears the temporary scan. Saving requires separate confirmation."
              : "Leaving, replacing or removing clears the temporary preview. Originals in your photo library stay unchanged. Upload requires separate confirmation."}
          </Text>
        </View>
      )}
    </Card>
  );
}