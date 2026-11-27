import React from "react";
import { Pressable } from "react-native";
import { Text } from "./Typography";

export function AppleSignInButton({
  onPress,
  disabled,
  busy,
}: {
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Sign in with Apple"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        borderRadius: 12,
        backgroundColor: "#000",
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
        {busy ? "Opening Apple…" : " Sign in with Apple"}
      </Text>
    </Pressable>
  );
}