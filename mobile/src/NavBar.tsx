import React from "react";
import { Platform, Pressable, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, usePalette, useReducedTransparency, type IconName } from "./ui";
import { visibleBadgeCount } from "./design";
import { activeTab, bottomNavFrame, bottomNavGlass, type BottomTabName } from "./shellPresentation";
import type { Route } from "./navigation";

const tabs: { name: BottomTabName; label: string; icon: IconName }[] = [
  { name: "home", label: "Home", icon: "home" },
  { name: "cart", label: "Bag", icon: "shopping-bag" },
  { name: "profile", label: "You", icon: "user" },
];

/** Exactly four controls in one pill. Optional companion UI lives outside the
 * tablist and never creates a fifth destination or overlaps a touch target. */
export function NavBar({ route, bagQuantity, onSelectTab, onTryOn, accessory }: {
  route: Route;
  bagQuantity: number;
  onSelectTab: (name: BottomTabName) => void;
  onTryOn: () => void;
  accessory?: React.ReactNode;
}) {
  const p = usePalette(), insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const { left, right, bottom, stackedAccessory, layout } = bottomNavFrame(width, fontScale, insets, !!accessory);
  const reducedTransparency = useReducedTransparency();
  const glass = bottomNavGlass(p.surface, Platform.OS === "web", reducedTransparency);
  const labelStyle = { fontSize: 10, lineHeight: 12, textAlign: "center" as const };

  function tab(item: typeof tabs[number]) {
    const active = activeTab(route.name) === item.name;
    const quantity = item.name === "cart" ? bagQuantity : 0;
    const label = item.name === "home" && route.brandId ? "Home, current store collection" : item.label;
    return (
      <Pressable
        key={item.name}
        testID={`bottom-tab-${item.name}`}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={label + (quantity ? `, ${quantity} ${quantity === 1 ? "piece" : "pieces"}` : "")}
        accessibilityHint={item.name === "cart" ? "Open your bag and local demo order history." : undefined}
        onPress={() => onSelectTab(item.name)}
        style={({ pressed }) => ({
          flex: 1, minWidth: 48, minHeight: layout.targetHeight,
          borderRadius: layout.radius, paddingHorizontal: 0, alignItems: "center", justifyContent: "center",
          backgroundColor: "transparent",
          opacity: pressed ? 0.65 : 1,
        })}
      >
        {active && <View testID="bottom-active-capsule" pointerEvents="none" style={{ position: "absolute", top: 6, bottom: 6, left: 4, right: 4, borderRadius: 20, backgroundColor: reducedTransparency ? p.tint : `${p.tint}D9` }} />}
        <View style={{ width: 32, height: 22, alignItems: "center", justifyContent: "center" }}>
          <Icon name={item.icon} size={18} color={active ? p.accent : p.text} />
          {quantity > 0 && (
            <View accessible={false} style={{ position: "absolute", top: -2, right: -6, minWidth: 17, paddingHorizontal: 3, borderRadius: 10, backgroundColor: p.accent, alignItems: "center" }}>
              <Text allowFontScaling={false} style={{ color: p.onAccent, fontSize: 10, lineHeight: 15, fontWeight: "700" }}>{visibleBadgeCount(quantity)}</Text>
            </View>
          )}
        </View>
        <Text maxFontSizeMultiplier={1.5} numberOfLines={1} style={{ ...labelStyle, color: active ? p.accent : p.text, fontWeight: active ? "600" : "400" }}>{item.label}</Text>
      </Pressable>
    );
  }

  return (
    <View testID="bottom-nav-safe-area" pointerEvents="box-none" style={{ flexShrink: 0, paddingTop: 2, paddingLeft: left, paddingRight: right, paddingBottom: bottom }}>
      <View testID="bottom-nav-row" pointerEvents="box-none" style={{ width: "100%", maxWidth: 720, alignSelf: "center", flexDirection: stackedAccessory ? "column-reverse" : "row", alignItems: "center", gap: 8 }}>
      <View
        testID="curved-bottom-nav"
        pointerEvents="box-none"
        accessibilityRole="tablist"
        accessibilityLabel="Main navigation"
        style={{ flex: stackedAccessory ? undefined : 1, width: stackedAccessory ? "100%" : undefined, minWidth: 196, height: layout.targetHeight, borderRadius: layout.radius }}
      >
        <View testID="bottom-nav-surface" pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: (layout.targetHeight - layout.height) / 2, height: layout.height, borderRadius: layout.radius, ...glass, borderWidth: 1, ...(reducedTransparency ? { borderColor: p.line } : {}), shadowColor: p.text, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 2 }} />
        <View testID="bottom-nav-controls" pointerEvents="box-none" style={{ flexDirection: "row", alignItems: "stretch", paddingHorizontal: 2, height: layout.targetHeight }}>
          {tabs.slice(0, 1).map(tab)}
          <Pressable
            testID="bottom-try-on"
            accessibilityRole="button"
            accessibilityLabel="Try On"
            accessibilityHint="Open local photo preparation. Choose a garment before preparing your photo. Nothing is uploaded or generated."
            onPress={onTryOn}
            style={({ pressed }) => ({ flex: 1, minWidth: 48, minHeight: layout.targetHeight, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}
          >
            <View testID="bottom-try-on-disc" style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: p.accent }}>
              <Icon name="camera" size={17} color={p.onAccent} />
            </View>
            <Text maxFontSizeMultiplier={1.5} numberOfLines={1} style={{ ...labelStyle, color: p.accent, fontWeight: "700" }}>Try On</Text>
          </Pressable>
          {tabs.slice(1).map(tab)}
        </View>
      </View>
      {!!accessory && <View testID="bottom-nav-accessory" pointerEvents="box-none" style={{ width: 48, minHeight: 48, alignSelf: stackedAccessory ? "flex-end" : "center", alignItems: "center", justifyContent: "center" }}>{accessory}</View>}
      </View>
    </View>
  );
}
