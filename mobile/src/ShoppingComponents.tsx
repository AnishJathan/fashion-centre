import React, { useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import {
  Badge,
  Body,
  Button,
  Card,
  Heading,
  Icon,
  Photo,
  Title,
  usePalette,
} from "./ui";
import { type Product } from "./core/domain";
import { homePrice } from "./commerceHome";
import { shoppingGridLayout } from "./shoppingLayout";

export function ShoppingHeader({
  eyebrow,
  title,
  description,
  compact = false,
}: {
  compact?: boolean;
  eyebrow: string;
  title: string;
  description?: string;
}) {
  const palette = usePalette();
  return (
    <View style={{ gap: compact ? 2 : 4 }}>
      {compact ? <Text style={{ color: palette.accent, fontSize: 12, lineHeight: 17, fontWeight: "600" }}>{eyebrow}</Text> : <Badge>{eyebrow}</Badge>}
      {compact ? <Text accessibilityRole="header" style={{ color: palette.text, fontSize: 16, lineHeight: 22, fontWeight: "700" }}>{title}</Text> : <Title>{title}</Title>}
      {description ? <Body>{description}</Body> : null}
    </View>
  );
}

/** Buy surfaces keep compact visual rhythm without shrinking their touch targets. */
export function ShoppingCard({ children }: React.PropsWithChildren) {
  const palette = usePalette();
  return <View testID="shopping-compact-card" style={{ padding: 10, gap: 6, borderRadius: 12, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface }}>{children}</View>;
}

export function ShoppingEmpty({
  title,
  description,
  action,
  onPress,
  compact = false,
}: {
  compact?: boolean;
  title: string;
  description: string;
  action?: string;
  onPress?: () => void;
}) {
  const palette = usePalette();
  const Container = compact ? ShoppingCard : Card;
  return (
    <Container>
      <View style={{ gap: compact ? 6 : 8, paddingVertical: compact ? 0 : 4 }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 16,
            backgroundColor: palette.tint,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="shopping-bag" color={palette.accent} size={20} />
        </View>
        {compact ? <Text accessibilityRole="header" style={{ color: palette.text, fontSize: 14, lineHeight: 20, fontWeight: "600" }}>{title}</Text> : <Heading>{title}</Heading>}
        <Body>{description}</Body>
        {action && onPress ? <Button label={action} onPress={onPress} /> : null}
      </View>
    </Container>
  );
}

export function ShoppingNotice({
  title,
  children,
  compact = false,
}: React.PropsWithChildren<{ title: string; compact?: boolean }>) {
  const palette = usePalette();
  return (
    <View
      style={{
        padding: compact ? 8 : 12,
        borderRadius: compact ? 10 : 16,
        gap: compact ? 4 : 6,
        backgroundColor: palette.tint,
      }}
    >
      <Text
        style={{
          fontSize: compact ? 13 : 14,
          lineHeight: compact ? 19 : 20,
          fontWeight: "700",
          color: palette.text,
        }}
      >
        {title}
      </Text>
      <Body>{children}</Body>
    </View>
  );
}

export function ProductGrid({ products, onView, onTryOn }: {
  products: Product[]; onView: (product: Product) => void; onTryOn?: (product: Product) => void;
}) {
  const window = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const palette = usePalette();
  const layout = shoppingGridLayout(measuredWidth || window.width - 40, window.fontScale);
  return <View onLayout={({ nativeEvent }) => setMeasuredWidth(nativeEvent.layout.width)} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: layout.gap, rowGap: 12 }}>
    {products.map((product) => {
      const available = product.variants.some((variant) => variant.available);
      return <View key={product.id} style={{ width: layout.cardWidth, minWidth: 0, gap: 4 }}>
        <View style={{ overflow: "hidden", borderRadius: 4, backgroundColor: palette.tint }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`View ${product.name}, ${product.brandName}`} onPress={() => onView(product)} style={({ pressed }) => ({ opacity: pressed ? .78 : 1 })}>
            <Photo key={product.image} allowRetry={false} uri={product.image} label={product.name} height={Math.min(160, Math.max(116, layout.cardWidth * .88))} />
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`View ${product.name}`} onPress={() => onView(product)} style={({ pressed }) => ({ gap: 1, minHeight: 48, opacity: pressed ? .65 : 1 })}>
          <Text style={{ color: palette.accent, fontSize: 12, lineHeight: 17, fontWeight: "600" }}>{product.brandName}</Text>
          <Text style={{ color: palette.text, fontSize: 13, lineHeight: 18, fontWeight: "500" }}>{product.name}</Text>
          <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 18 }}>{homePrice(product)}</Text>
          {!available && <Text style={{ color: palette.error, fontSize: 12, lineHeight: 18 }}>Unavailable</Text>}
        </Pressable>
        {onTryOn && <Pressable accessibilityRole="button" accessibilityLabel={`Try on ${product.name}`} accessibilityState={{ disabled: !product.image }} disabled={!product.image} onPress={() => onTryOn(product)} style={{ minHeight: 48, minWidth: 84, alignSelf: "flex-start", justifyContent: "center", opacity: product.image ? 1 : .5 }}><View style={{ minHeight: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: palette.tint, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}><Icon name="camera" size={13} color={palette.accent} /><Text style={{ color: palette.accent, fontSize: 11, lineHeight: 16, fontWeight: "600" }}>Try on</Text></View></Pressable>}
      </View>;
    })}
  </View>;
}

/** Stacks at large text sizes rather than squeezing product details beside a thumbnail. */
export function ShoppingLine({
  image,
  name,
  children,
  compact = false,
}: React.PropsWithChildren<{ image?: string; name: string; compact?: boolean }>) {
  const { width, fontScale } = useWindowDimensions();
  const palette = usePalette();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const stack = (compact ? (measuredWidth || width - 44) < 220 : width < 350) || fontScale >= 1.3;
  return (
    <View
      testID={compact ? "shopping-compact-line" : undefined}
      onLayout={({ nativeEvent }) => setMeasuredWidth(nativeEvent.layout.width)}
      style={{
        flexDirection: stack ? "column" : "row",
        alignItems: "flex-start",
        gap: compact ? 8 : 10,
      }}
    >
      {!!image && (
        <View style={{ width: compact ? 56 : stack ? "100%" : 84 }}>
          <Photo
            key={image}
            uri={image}
            label={name}
            height={compact ? 72 : stack ? 180 : 112}
          />
        </View>
      )}
      <View
        style={{
          flex: stack ? undefined : 1,
          alignSelf: "stretch",
          minWidth: 0,
          gap: compact ? 2 : 6,
        }}
      >
        {compact ? <Text accessibilityRole="header" style={{ color: palette.text, fontSize: 14, lineHeight: 20, fontWeight: "600" }}>{name}</Text> : <Heading>{name}</Heading>}
        {children}
      </View>
    </View>
  );
}
