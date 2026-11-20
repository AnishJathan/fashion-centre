import React, { useRef, useState } from "react";
import { Text } from "./Typography";
import { AccessibilityInfo, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { metrics } from "./design";
import { matchingCountries, type PhoneCountry } from "./phoneCountries";
import { Field, Icon, usePalette } from "./ui";

export function CountryPicker({country, onChange, disabled}: {
  country: PhoneCountry; onChange: (country: PhoneCountry) => void; disabled?: boolean;
}) {
  const p = usePalette(), insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false), [search, setSearch] = useState("");
  const trigger = useRef<React.ComponentRef<typeof View>>(null);
  const results = matchingCountries(search);
  function close() { Keyboard.dismiss(); setOpen(false); }
  return <>
    <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={`Country code, ${country.name} ${country.dial}`}
      accessibilityState={{expanded: open, disabled}} disabled={disabled}
      onPress={() => { Keyboard.dismiss(); setSearch(""); setOpen(true); }}
      style={{minHeight: metrics.touch, paddingHorizontal: 12, borderRadius: metrics.controlRadius, borderWidth: 1.5,
        borderColor: p.controlLine, backgroundColor: p.surface, flexDirection: "row", alignItems: "center", gap: 6}}>
      <Text style={{color: p.muted, fontWeight: "600"}}>{country.iso}</Text>
      <Text style={{color: p.text, fontWeight: "700"}}>{country.dial}</Text>
      <Icon name="chevron-down" size={16}/>
    </Pressable>
    <Modal transparent visible={open} animationType="fade" onRequestClose={close}
      onDismiss={() => { if (trigger.current) AccessibilityInfo.sendAccessibilityEvent(trigger.current, "focus"); }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)"}}>
        <Pressable accessible={false} onPress={close} style={{flex: 1}}/>
        <View accessibilityViewIsModal onAccessibilityEscape={close}
          style={{alignSelf: "center", width: "100%", maxWidth: 600, maxHeight: "88%", padding: metrics.gap,
            paddingBottom: Math.max(insets.bottom, metrics.gap), borderTopLeftRadius: metrics.cardRadius,
            borderTopRightRadius: metrics.cardRadius, backgroundColor: p.surface, gap: metrics.compactGap}}>
          <View style={{flexDirection: "row", alignItems: "center", justifyContent: "space-between"}}>
            <Text accessibilityRole="header" style={{color: p.text, fontSize: 20, fontWeight: "700", flex: 1}}>Choose a country code</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close country picker" onPress={close}
              style={{minWidth: metrics.touch, minHeight: metrics.touch, alignItems:"center", justifyContent:"center"}}><Icon name="x"/></Pressable>
          </View>
          <Field label="Search countries" placeholder="Country or calling code" value={search} onChangeText={setSearch} autoCorrect={false}/>
          <ScrollView keyboardShouldPersistTaps="handled">
            {results.map(item => <Pressable key={item.iso} accessibilityRole="radio" accessibilityState={{checked: country.iso === item.iso}}
              accessibilityLabel={`${item.name} ${item.dial}`} onPress={() => { onChange(item); close(); }}
              style={{minHeight: metrics.touch, flexDirection: "row", gap: 8, padding: 12, alignItems: "center",
                borderRadius: metrics.insetRadius, backgroundColor: country.iso === item.iso ? p.tint : p.surface}}>
              <Text style={{color: p.text, flex: 1}}>{item.name}</Text><Text style={{color: p.accent, fontWeight: "600"}}>{item.dial}</Text>
              {country.iso === item.iso && <Icon name="check" size={16}/>}
            </Pressable>)}
            {!results.length && <Text accessibilityLiveRegion="polite" style={{color: p.muted, padding: 12}}>No matching countries.</Text>}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </>;
}
