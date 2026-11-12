import { runCaptureStep, shouldStopScanner } from "./scanSession";
import React, { useEffect, useRef, useState } from "react";
import { AppState, View, Text, useWindowDimensions } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as FS from "expo-file-system/legacy";
import { Button, usePalette } from "../ui";
import { AccountNotice, AccountSection } from "../AccountUI";
import { cameraStageHeight } from "./layout";
import {
  analyzePhoto,
  hasNativeVision,
  requireGoodPhoto,
  visionUnavailableMessage,
} from "./vision";
import { CaptureGate } from "./quality";
import { discard, normalizeLocalPhoto, type LocalPhoto } from "./native";

export function CameraScanner({
  onAccepted,
  onCancel,
}: {
  onAccepted: (photo: LocalPhoto) => void;
  onCancel: () => void;
}) {
  const p = usePalette(),
    [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false),
    [message, setMessage] = useState("Starting camera…"),
    [failed, setFailed] = useState(false),
    [permissionState, setPermissionState] = useState(
      permission?.granted ? "granted" : "requesting",
    ),
    [stageWidth, setStageWidth] = useState(0);
  const { width, height } = useWindowDimensions();
  const camera = useRef<CameraView>(null),
    accepted = useRef(onAccepted),
    cancel = useRef(onCancel);
  const permissionPending = useRef(!permission?.granted);
  accepted.current = onAccepted;
  cancel.current = onCancel;
  useEffect(() => {
    let active = true;
    if (hasNativeVision && !permission?.granted)
      void requestPermission()
        .then((r) => {
          if (active) {
            setPermissionState(r.granted ? "granted" : "denied");
            if (!r.granted)
              setMessage(
                "Camera permission was not granted. Choose a photo or change camera access in your device settings.",
              );
          }
        })
        .catch(() => {
          if (active) {
            setPermissionState("denied");
            setMessage("Camera permission could not be requested.");
          }
        })
        .finally(() => {
          permissionPending.current = false;
        });
    else permissionPending.current = false;
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (shouldStopScanner(state, permissionPending.current)) cancel.current();
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!ready || !permission?.granted || !hasNativeVision || failed) return;
    let active = true,
      timer: ReturnType<typeof setTimeout> | undefined;
    const gate = new CaptureGate();
    async function scan() {
      try {
        const photo = await runCaptureStep({
          active: () => active,
          gate,
          now: Date.now,
          capture: (quality) =>
            camera.current?.takePictureAsync({
              quality,
              exif: false,
              base64: false,
              shutterSound: false,
            }) ?? Promise.resolve(undefined),
          analyze: async (uri) => (await analyzePhoto(uri, true)).feedback,
          normalize: (uri) => normalizeLocalPhoto(uri),
          validate: async (photo) => {
            await requireGoodPhoto(photo.uri);
          },
          remove: (uri) => FS.deleteAsync(uri, { idempotent: true }),
          message: setMessage,
        });
        if (photo) {
          if (!active) {
            await discard(photo);
            return;
          }
          active = false;
          accepted.current(photo);
          return;
        }
      } catch (e) {
        if (active)
          setMessage(
            e instanceof Error
              ? e.message
              : "Photo analysis failed. Try again or choose a photo.",
          );
      } finally {
        if (active) timer = setTimeout(() => void scan(), 350);
      }
    }
    void scan();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      gate.reset();
    };
  }, [ready, permission?.granted, failed]);
  return (
    <View style={{ gap: 12 }}>
      <AccountSection
        title="Full-body scan"
        description="Stand 2–3 steps back. Keep your head and feet visible, then hold still."
      />
      {!hasNativeVision ? (
        <AccountNotice
          title="Scanner unavailable"
          message={visionUnavailableMessage}
        />
      ) : permission?.granted && !failed ? (
        <View
          onLayout={(event) => setStageWidth(event.nativeEvent.layout.width)}
          style={{
            height: cameraStageHeight(stageWidth || width - 76, height),
            borderRadius: 20,
            overflow: "hidden",
            backgroundColor: "#17131E",
          }}
        >
          <CameraView
            ref={camera}
            facing="front"
            mode="picture"
            mirror={false}
            style={{ flex: 1 }}
            onCameraReady={() => setReady(true)}
            onMountError={() => {
              setFailed(true);
              setMessage(
                "The camera could not start. Close the scanner and choose a photo instead.",
              );
            }}
          />
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              position: "absolute",
              top: "13%",
              bottom: "8%",
              left: "22%",
              right: "22%",
              borderWidth: 2,
              borderColor: "rgba(255,255,255,0.85)",
              borderStyle: "dashed",
              borderRadius: 70,
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              right: 12,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: "#FFFFFF",
                backgroundColor: "rgba(23,19,30,0.8)",
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 16,
                fontSize: 12,
                fontWeight: "600",
                textAlign: "center",
              }}
            >
              Automatic capture · Front camera
            </Text>
          </View>
        </View>
      ) : null}
      {hasNativeVision && (
        <AccountNotice
          title={
            failed || permissionState === "denied"
              ? "Camera needs attention"
              : ready
                ? "Live guidance"
                : "Getting ready"
          }
          busy={!failed && permissionState !== "denied" && !ready}
          error={failed || permissionState === "denied"}
          message={message}
        />
      )}
      <Button secondary label="Close scanner" onPress={onCancel} />
      <Text style={{ color: p.muted, fontSize: 12, lineHeight: 18 }}>
        Your head, shoulders, hips, knees and ankles must stay visible for
        several checks. Capture is automatic; there is no shutter button. Images
        are analysed on this device and are not uploaded.
      </Text>
    </View>
  );
}
