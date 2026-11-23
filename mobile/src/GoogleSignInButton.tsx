import React from "react";
import { Text } from "./Typography";
import { ActivityIndicator, Image, Pressable } from "react-native";
import { metrics } from "./design";

export function GoogleSignInButton({disabled, busy, onPress}: {disabled: boolean; busy: boolean; onPress: () => void}) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Continue with Google" accessibilityState={{disabled, busy}}
    disabled={disabled} onPress={onPress}
    style={({pressed}) => ({flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
      minHeight: metrics.touch, paddingHorizontal: 16, paddingVertical: 10, borderRadius: metrics.controlRadius,
      borderWidth: 1, borderColor: "#747775", backgroundColor: "#FFFFFF", opacity: pressed || disabled ? .65 : 1})}>
    {busy ? <ActivityIndicator size="small" color="#1F1F1F"/> :
      <Image source={require("../assets/identity/google-g.png")} accessible={false} resizeMode="contain" style={{width: 20, height: 20}}/>}
    <Text style={{flexShrink: 1, color: "#1F1F1F", fontSize: 16, fontWeight: "500", textAlign: "center"}}>Continue with Google</Text>
  </Pressable>;
}
