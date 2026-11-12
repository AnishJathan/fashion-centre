import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Body, Icon, usePalette, type IconName } from "./ui";
import { stackSettingsControls } from "./settingsPresentation";

export function SettingsGroup({
  title,
  footer,
  children,
}: React.PropsWithChildren<{ title: string; footer?: string }>) {
  const p = usePalette();
  return (
    <View style={styles.section}>
      <Text
        accessibilityRole="header"
        style={[styles.sectionLabel, { color: p.muted }]}
      >
        {title}
      </Text>
      <View
        style={[
          styles.group,
          { backgroundColor: p.surface, borderColor: p.line },
        ]}
      >
        {children}
      </View>
      {footer && (
        <View style={styles.footer}>
          <Body>{footer}</Body>
        </View>
      )}
    </View>
  );
}

export function SettingsDivider() {
  const p = usePalette();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        marginHorizontal: 16,
        backgroundColor: p.line,
      }}
    />
  );
}

export function SettingsContent({ children }: React.PropsWithChildren) {
  return <View style={styles.content}>{children}</View>;
}

function Chevron({ open = false }: { open?: boolean }) {
  const p = usePalette();
  return (
    <View
      importantForAccessibility="no"
      style={{
        width: 8,
        height: 8,
        borderRightWidth: 1.5,
        borderTopWidth: 1.5,
        borderColor: p.muted,
        transform: [{ rotate: open ? "135deg" : "45deg" }],
        marginRight: 3,
      }}
    />
  );
}

export function SettingsRow({
  label,
  detail,
  count,
  onPress,
  busy = false,
  icon,
}: {
  label: string;
  detail?: string;
  count?: number;
  onPress: () => void;
  busy?: boolean;
  icon?: IconName;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[label, count, detail]
        .filter((v) => v !== undefined)
        .join(", ")}
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? p.tint : "transparent" },
      ]}
    >
      {icon && <View style={styles.leadingIcon}><Icon name={icon} size={21} /></View>}
      <View style={styles.rowCopy}>
        <Text style={[styles.rowLabel, { color: p.text }]}>{label}</Text>
        {detail && (
          <Text style={[styles.detail, { color: p.muted }]}>{detail}</Text>
        )}
      </View>
      {count !== undefined && (
        <Text
          style={[styles.count, { color: p.accent, backgroundColor: p.tint }]}
        >
          {count}
        </Text>
      )}
      {busy ? <ActivityIndicator color={p.accent} /> : <Chevron />}
    </Pressable>
  );
}

export function SettingsChoice({
  label,
  value,
  options,
  open,
  disabled = false,
  onToggle,
  onChange,
  icon,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  open: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
  icon?: IconName;
}) {
  const p = usePalette();
  const { width, fontScale } = useWindowDimensions();
  const stacked = stackSettingsControls(width, fontScale);
  const current =
    options.find((option) => option.value === value)?.label || "Not selected";
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${current}`}
        accessibilityHint="Choose a preference"
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={onToggle}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: pressed ? p.tint : "transparent",
            opacity: disabled ? 0.6 : 1,
          },
        ]}
      >
        {icon && <View style={styles.leadingIcon}><Icon name={icon} size={21} /></View>}
        <View style={[styles.rowCopy, !stacked && styles.choiceLabel]}>
          <Text style={[styles.rowLabel, { color: p.text, flexShrink: 1 }]}>
            {label}
          </Text>
          <Text style={[styles.detail, { color: p.accent, flexShrink: 1 }]}>
            {current}
          </Text>
        </View>
        <Chevron open={open} />
      </Pressable>
      {open && (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={label}
          style={[styles.options, { borderTopColor: p.line }]}
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected, disabled }}
                disabled={disabled}
                accessibilityLabel={option.label}
                onPress={() => onChange(option.value)}
                style={({ pressed }) => [
                  styles.option,
                  {
                    backgroundColor:
                      selected || pressed ? p.tint : "transparent",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.rowLabel,
                    {
                      flex: 1,
                      color: p.text,
                      fontWeight: selected ? "600" : "400",
                    },
                  ]}
                >
                  {option.label}
                </Text>
                <View
                  style={[
                    styles.radio,
                    { borderColor: selected ? p.accent : p.muted },
                  ]}
                >
                  {selected && (
                    <View
                      style={[styles.radioDot, { backgroundColor: p.accent }]}
                    />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

export function FollowedStoreRow({
  name,
  detail,
  onExplore,
  onUnfollow,
  busy,
}: {
  name: string;
  detail: string;
  onExplore?: () => void;
  onUnfollow: () => void;
  busy: boolean;
}) {
  const p = usePalette();
  const { width, fontScale } = useWindowDimensions();
  const stacked = stackSettingsControls(width, fontScale);
  const copy = (
    <>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowLabel, { color: p.text }]}>{name}</Text>
        <Text style={[styles.detail, { color: p.muted }]}>{detail}</Text>
      </View>
      {!!onExplore && <Chevron />}
    </>
  );
  return (
    <View
      style={{
        flexDirection: stacked ? "column" : "row",
        paddingRight: 8,
        paddingBottom: stacked ? 8 : 0,
        alignItems: stacked ? "stretch" : "center",
      }}
    >
      {onExplore ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Explore ${name}`}
          onPress={onExplore}
          style={({ pressed }) => [
            styles.row,
            {
              flex: stacked ? undefined : 1,
              minWidth: 0,
              backgroundColor: pressed ? p.tint : "transparent",
            },
          ]}
        >
          {copy}
        </Pressable>
      ) : (
        <View
          style={[styles.row, { flex: stacked ? undefined : 1, minWidth: 0 }]}
        >
          {copy}
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Unfollow ${name}`}
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy}
        onPress={onUnfollow}
        style={({ pressed }) => [
          styles.unfollow,
          {
            marginLeft: stacked ? 16 : 0,
            backgroundColor: pressed ? p.tint : "transparent",
          },
        ]}
      >
        {busy ? (
          <ActivityIndicator color={p.accent} />
        ) : (
          <Text style={{ color: p.accent, fontSize: 14, fontWeight: "600" }}>
            Unfollow
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 4, paddingTop: 10 },
  sectionLabel: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    paddingHorizontal: 10,
  },
  group: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 0,
    overflow: "hidden",
  },
  footer: { paddingHorizontal: 10, paddingTop: 4 },
  content: { padding: 12, gap: 10 },
  row: {
    minHeight: 52,
    paddingVertical: 10,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  leadingIcon: { width: 24, alignItems: "center", justifyContent: "center" },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowLabel: { fontSize: 14, lineHeight: 20, fontWeight: "500" },
  detail: { fontSize: 12, lineHeight: 17 },
  count: {
    minWidth: 28,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 3,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
  },
  choiceLabel: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  options: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  option: {
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  unfollow: {
    minWidth: 88,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
  },
});
