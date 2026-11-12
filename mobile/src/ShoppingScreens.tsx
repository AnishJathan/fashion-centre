import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  defaultVariant,
  browseControls,
  createOperationGate,
} from "./core/shopper";
import { useApp } from "./state";
import { ExperienceIntro } from "./Experience";
import { BrandMark } from "./BrandMark";
import { CommerceHome } from "./CommerceHome";
import { BrandStorefront } from "./BrandStorefront";
import { moods, moodProducts, type MoodId } from "./experience";
import type { Route } from "./navigation";
import { money, selectProducts, type Product } from "./core/domain";
import {
  checkoutReady,
  resolveLine,
  totals,
  MAX_QUANTITY,
  type CartLine,
} from "./core/commerce";
import {
  Screen,
  Heading,
  Icon,
  Body,
  Button,
  Card,
  Field,
  Badge,
  Row,
  Choices,
  Photo,
  usePalette,
  Status,
} from "./ui";
import {
  ProductGrid,
  ShoppingEmpty,
  ShoppingCard,
  ShoppingHeader,
  ShoppingLine,
  ShoppingNotice,
} from "./ShoppingComponents";
type Props = { route: Route; navigate: (r: Route) => void; back: () => void };

/** One line of small visual pills, with full-size touch targets and uncapped text. */
function CatalogueChoices({ label, value, options, onChange, showLabel = false }: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
  showLabel?: boolean;
}) {
  const palette = usePalette();
  const { width } = useWindowDimensions();
  const [availableWidth, setAvailableWidth] = useState(0);
  const scroll = useRef<React.ElementRef<typeof ScrollView>>(null);
  const positions = useRef<Record<string, number>>({});
  useEffect(() => {
    const x = positions.current[value];
    if (x !== undefined) scroll.current?.scrollTo({ x: Math.max(0, x - 4), animated: false });
  }, [value, availableWidth]);
  return <View style={{ minWidth: 0, gap: 0 }}>
    {showLabel && <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 18, fontWeight: "600" }}>{label}</Text>}
    <ScrollView
      ref={scroll}
      horizontal
      testID={`catalogue-${label.toLowerCase().replace(/ /g, "-")}-rail`}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      onLayout={({ nativeEvent }) => setAvailableWidth(nativeEvent.layout.width)}
      style={{ minWidth: 0, flexGrow: 0 }}
      contentContainerStyle={{ gap: 6, alignItems: "center", paddingRight: 4 }}
    >
      {options.map(option => {
        const selected = value === option.value;
        return <Pressable
          key={option.value}
          accessibilityRole="radio"
          accessibilityLabel={option.label}
          accessibilityState={{ checked: selected }}
          onLayout={({ nativeEvent }) => {
            const x = nativeEvent.layout.x;
            positions.current[option.value] = x;
            if (selected) scroll.current?.scrollTo({ x: Math.max(0, x - 4), animated: false });
          }}
          onPress={() => onChange(option.value)}
          style={({ pressed }) => ({ minHeight: 48, minWidth: 48, maxWidth: Math.max(48, availableWidth || width - 32), paddingVertical: 4, justifyContent: "center", opacity: pressed ? 0.7 : 1 })}
        >
          <View style={{ minHeight: 30, paddingHorizontal: 11, paddingVertical: 4, borderRadius: 18, borderWidth: 1, borderColor: selected ? palette.accent : palette.line, backgroundColor: selected ? palette.tint : palette.surface, justifyContent: "center" }}>
            <Text style={{ color: selected ? palette.accent : palette.text, fontSize: 13, lineHeight: 18, fontWeight: selected ? "600" : "400", flexShrink: 1 }}>{option.label}</Text>
          </View>
        </Pressable>;
      })}
    </ScrollView>
  </View>;
}
export function ShoppingScreen(props: Props) {
  if (props.route.name === "photos")
    return <CatalogueViewer key={props.route.productId} {...props} />;
  return <ShoppingPage key={[props.route.name, props.route.brandId, props.route.productId, props.route.orderId].join(":")} {...props} />;
}
function ShoppingPage(props: Props) {
  const a = useApp();
  const scroll = useRef<React.ElementRef<typeof ScrollView>>(null);
  const content = useShoppingContent({ ...props, scrollTo: (y) => scroll.current?.scrollTo({ y, animated: false }) });
  // Home owns its virtualized list and pinned controls. Never nest that list in
  // Screen's vertical ScrollView; browse/detail routes keep their existing shell.
  if (content.type === CommerceHome) return content;
  return <Screen scrollRef={scroll} contentContainerStyle={{ paddingTop: 6, gap: 8 }}>
    {a.catalogueLoading && <Card><Row><ActivityIndicator accessibilityLabel="Loading catalogues" /><Body>Loading your catalogues…</Body></Row></Card>}
    {!!a.catalogueError && <Card><Status message={a.catalogueError} error /><Button label="Retry catalogues" onPress={() => { void a.reload(); }} /></Card>}
    {content}
  </Screen>;
}
function useShoppingContent({ route, navigate, back, scrollTo }: Props & { scrollTo?: (y: number) => void }) {
  const a = useApp();
  const palette = usePalette();
  const window = useWindowDimensions();
  const [showFilters, setShowFilters] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [mood, setMood] = useState<MoodId>("all");
  const [browseOnly, setBrowseOnly] = useState(false);
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [priceCap, setPriceCap] = useState<{ amount: number; currency: string } | null>(null);
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("All"),
    [store, setStore] = useState(""),
    [sort, setSort] = useState("featured"),
    [variantKey, setVariantKey] = useState(""),
    [filter, setFilter] = useState(route.name === "orders" ? route.brandId || "All" : "All"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [messageError, setMessageError] = useState(false);
  const submitting = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const gate = useRef(createOperationGate());
  useFocusEffect(
    useCallback(() => {
      gate.current.focus();
      setBusy(submitting.current);
      return () => gate.current.blur();
    }, []),
  );
  const scoped = a.products.filter(
    (p) => !route.brandId || p.brandId === route.brandId,
  );
  const product = a.products.find((p) => p.id === route.productId);
  const brand = a.brands.find((b) => b.id === route.brandId);
  function bagOrdersSwitch() {
    const sections = [
      { name: "cart" as const, label: "Bag", icon: "shopping-bag" as const },
      { name: "orders" as const, label: "Orders", icon: "check-circle" as const },
    ];
    return (
      <View testID="bag-orders-switch" accessibilityRole="tablist" accessibilityLabel="Bag and orders" style={{ flexDirection: "row", gap: 4, borderBottomWidth: 1, borderColor: palette.line }}>
        {sections.map(section => {
          const selected = route.name === section.name;
          return (
            <Pressable
              key={section.name}
              testID={`bag-section-${section.name}`}
              accessibilityRole="tab"
              accessibilityLabel={section.label}
              accessibilityState={{ selected }}
              accessibilityHint={section.name === "orders" ? "View demo orders saved on this device." : "View your current selection."}
              onPress={() => { if (!selected) navigate({ name: section.name, brandId: route.brandId }); }}
              style={({ pressed }) => ({ flex: 1, minWidth: 48, minHeight: 48, paddingVertical: 4, justifyContent: "center", opacity: pressed ? 0.7 : 1 })}
            >
              <View style={{ minHeight: 30, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: selected ? palette.tint : "transparent", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }}>
                <Icon name={section.icon} size={16} color={selected ? palette.accent : palette.muted} />
                <Text style={{ color: selected ? palette.accent : palette.muted, fontSize: 13, lineHeight: 18, fontWeight: selected ? "600" : "500", flexShrink: 1 }}>{section.label}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    );
  }
  function prices(lines: CartLine[]) {
    return totals(
      lines.flatMap((l) => {
        const { variant } = resolveLine(l, a.products);
        return variant
          ? [
              {
                price: variant.amount,
                currency: variant.currency,
                quantity: l.quantity,
              },
            ]
          : [];
      }),
    ).map((t) => (
      <Text key={t.currency} accessibilityRole="header" style={{ color: palette.text, fontSize: 16, lineHeight: 22, fontWeight: "700" }}>{money(t.amount, t.currency)}</Text>
    ));
  }
  function cartLine(l: CartLine, i: number, editable = true) {
    const { product: p, variant: v, available } = resolveLine(l, a.products);
    const name = p?.name || l.name || "Unavailable item";
    return (
      <ShoppingCard key={l.productId + (l.variantKey || l.size) + i}>
        <ShoppingLine compact image={p?.image} name={name}>
          <Body>
            {l.size} · Quantity {l.quantity}
          </Body>
          {v && (
            <>
              <Body>
                {Object.entries(v.options)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(" · ")}
              </Body>
              <Body>{money(v.amount, v.currency)} each</Body>
            </>
          )}
        </ShoppingLine>
        {!available && (
          <ShoppingNotice compact title="This selection is unavailable">
            Its store is disabled, catalogue unavailable, or variant no longer
            offered. Your selection is preserved.
          </ShoppingNotice>
        )}
        {editable && (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 6,
            }}
          >
            <Row>
              <Button
                secondary
                style={{ minWidth: 48, minHeight: 48, paddingHorizontal: 8 }}
                label="−"
                accessibilityLabel={`Decrease quantity of ${name}`}
                disabled={l.quantity === 1}
                onPress={() => {
                  void a.dispatch({ type: "adjust", ...l, delta: -1 });
                }}
              />
              <Text
                accessibilityLabel={`Quantity ${l.quantity}`}
                style={{
                  minWidth: 28,
                  color: palette.text,
                  fontSize: 14,
                  fontWeight: "600",
                  textAlign: "center",
                }}
              >
                {l.quantity}
              </Text>
              <Button
                secondary
                style={{ minWidth: 48, minHeight: 48, paddingHorizontal: 8 }}
                label="+"
                accessibilityLabel={`Increase quantity of ${name}`}
                disabled={l.quantity >= MAX_QUANTITY}
                onPress={() => {
                  void a.dispatch({ type: "adjust", ...l, delta: 1 });
                }}
              />
            </Row>
            <Button
              secondary
              label="Remove"
              accessibilityLabel={`Remove ${name} from cart`}
              onPress={() => {
                void a.dispatch({ type: "remove", ...l });
              }}
            />
          </View>
        )}
      </ShoppingCard>
    );
  }
  if (route.name === "stores")
    return (
      <>
        <ShoppingHeader
          eyebrow="Your centre, your choices"
          title="Manage stores"
          description="Add the fictional demo stores you want to explore."
        />
        <ShoppingNotice title="Demo catalogues only">
          Adding a store does not connect Shopify or authorize a merchant
          account.
        </ShoppingNotice>
        {!a.sources.length && !a.catalogueLoading && (
          <ShoppingEmpty
            title="No demo stores loaded"
            description="The directory is not available yet. Try loading it again."
            action="Retry directory"
            onPress={() => {
              void a.reload();
            }}
          />
        )}
        {a.sources.map((s) => {
          const registration = a.registrations.find((r) => r.id === s.key);
          return (
            <Card key={s.key}>
              <Heading>{s.name}</Heading>
              <Badge>
                {registration
                  ? registration.enabled
                    ? "Enabled"
                    : "Disabled"
                  : "Not added"}
              </Badge>
              <Button
                secondary={!!registration?.enabled}
                label={
                  registration
                    ? registration.enabled
                      ? "Disable store"
                      : "Enable store"
                    : "Add demo store"
                }
                onPress={() => {
                  void (registration ? a.toggleStore(s.key) : a.onboard(s.key));
                }}
              />
              {a.brands.some((b) => b.id === s.key) && (
                <Button
                  secondary
                  label="Explore collection"
                  onPress={() => navigate({ name: "brand", brandId: s.key })}
                />
              )}
            </Card>
          );
        })}
        <Button
          secondary
          label="Brand-owner dashboard"
          onPress={() => navigate({ name: "owner" })}
        />
      </>
    );
  if (route.name === "brands")
    return (
      <>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><Text accessibilityRole="header" style={{ fontSize: 14, fontWeight: "600", color: palette.text }}>{a.brands.length} demo stores</Text><Pressable accessibilityRole="button" accessibilityLabel="Manage demo stores" onPress={() => navigate({ name: "stores" })} style={{ minHeight: 48, paddingHorizontal: 8, justifyContent: "center" }}><Text style={{ fontSize: 12, color: palette.accent, fontWeight: "600" }}>Manage</Text></Pressable></View>
        <View style={{ gap: 0 }}>
          {a.brands.map(b => <View key={b.id} style={{ minHeight: 60, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderColor: palette.line, gap: 8 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${b.name} storefront`} onPress={() => navigate({ name: "brand", brandId: b.id })} style={{ minHeight: 56, flex: 1, flexDirection: "row", alignItems: "center", gap: 9 }}><BrandMark id={b.id} name={b.name} size={28} /><View style={{ flex: 1, gap: 2 }}><Text numberOfLines={1} style={{ color: palette.text, fontSize: 13, fontWeight: "600" }}>{b.name}</Text><Text style={{ color: palette.muted, fontSize: 11 }}>{b.products.length} demo pieces</Text></View><Icon name="chevron-right" size={14} color={palette.muted} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`${a.followed.includes(b.id) ? "Unfollow" : "Follow"} ${b.name}`} accessibilityState={{ selected: a.followed.includes(b.id) }} onPress={() => { void a.toggleFollowed(b.id); }} style={{ minWidth: 76, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}><Icon name={a.followed.includes(b.id) ? "check" : "plus"} size={14} color={palette.accent} /><Text style={{ fontSize: 11, color: palette.accent, fontWeight: "600" }}>{a.followed.includes(b.id) ? "Following" : "Follow"}</Text></Pressable>
          </View>)}
        </View>
        {!a.brands.length && !a.catalogueLoading && <ShoppingEmpty title="Find your first store" description="Add a demo store to bring its collection into your centre." action="Manage demo stores" onPress={() => navigate({ name: "stores" })} />}
        {!!a.products.length && <><Text accessibilityRole="header" style={{ fontSize: 14, fontWeight: "600", color: palette.text, marginTop: 4 }}>From your stores</Text><ProductGrid products={a.products.slice(0, 8)} onView={piece => navigate({ name: "product", productId: piece.id, brandId: piece.brandId })} onTryOn={piece => navigate({ name: "try-on", productId: piece.id, brandId: piece.brandId })} /></>}
      </>
    );
  if (route.name === "product") {
    if (!product)
      return (
        <>
          <ShoppingEmpty
            title={
              a.catalogueLoading ? "Loading this piece" : "Piece unavailable"
            }
            description="Enable its store or retry the catalogue. Saved and cart references are retained."
            action="Manage stores"
            onPress={() => navigate({ name: "stores" })}
          />
          <Button secondary label="Back" onPress={back} />
        </>
      );
    const v =
      product.variants.find((v) => v.key === variantKey) ||
      defaultVariant(product);
    return (
      <>
        <View>
        <Photo
          key={product.image}
          uri={product.image}
          label={product.name}
          contain
          height={Math.min(280, Math.max(200, (window.width - 32) * .72))}
        />
        <Button label="Try on this piece" icon="camera" disabled={!product.image} onPress={() => navigate({ name: "try-on", productId: product.id, brandId: product.brandId })} style={{ position: "absolute", bottom: 12, right: 12, minHeight: 48, paddingHorizontal: 14 }} />
        </View>
        <ShoppingHeader
          eyebrow={product.brandName}
          title={product.name}
          description={`${product.category} · Fictional demo piece`}
        />
        <Button
          secondary
          icon="image"
          label="View catalogue photos"
          disabled={!product.image}
          onPress={() =>
            navigate({
              name: "photos",
              productId: product.id,
              brandId: product.brandId,
            })
          }
        />
        <Card>
          {v ? (
            <Heading>{money(v.amount, v.currency)}</Heading>
          ) : (
            <Body>No variants supplied for this piece.</Body>
          )}
          <Choices
            label="Choose variant"
            value={v?.key || ""}
            options={product.variants.map((v) => ({
              value: v.key,
              label: `${v.title} · ${Object.values(v.options).join(" / ")}${v.available ? "" : " · Unavailable"}`,
            }))}
            onChange={setVariantKey}
          />
          {v && !v.available && (
            <Status
              message="This variant is unavailable. Choose another option to add it to your cart."
              error
            />
          )}
          <Button
            label={busy ? "Adding…" : "Add to demo cart"}
            icon="shopping-bag"
            busy={busy}
            disabled={!v?.available || busy}
            onPress={() => {
              if (!v || submitting.current) return;
              const token = gate.current.capture();
              const existing = a.commerce.cart.find(
                (l) => l.productId === product.id && l.variantKey === v.key,
              );
              if (existing && existing.quantity >= MAX_QUANTITY) {
                setMessageError(true);
                setMessage(
                  `Not added. Maximum ${MAX_QUANTITY} of this variant per demo cart.`,
                );
                return;
              }
              submitting.current = true;
              setBusy(true);
              setMessage("");
              void a
                .dispatch({ type: "add", product, variantKey: v.key })
                .then((ok) => {
                  if (!gate.current.permits(token)) return;
                  setMessageError(!ok);
                  setMessage(
                    ok
                      ? "Added to your local demo cart."
                      : "Not added. Check the quantity limit or storage message.",
                  );
                })
                .catch(() => {
                  if (gate.current.permits(token)) {
                    setMessageError(true);
                    setMessage(
                      "Not added. Check the storage message and retry.",
                    );
                  }
                })
                .finally(() => {
                  submitting.current = false;
                  if (mounted.current) setBusy(false);
                });
            }}
          />
          <Button
            icon="camera"
            label="Try on with my saved photo"
            disabled={!product.image}
            onPress={() => navigate({ name: "try-on", productId: product.id, brandId: product.brandId })}
          />
          <Button
            secondary
            icon="user"
            label="Prepare a try-on photo"
            onPress={() => navigate({ name: "prepare", productId: product.id, brandId: product.brandId })}
          />
          <Status message={message} error={messageError} />
          <Button
            secondary
            label="View cart"
            onPress={() => navigate({ name: "cart", brandId: product.brandId })}
          />
        </Card>
        {!!product.description && (
          <Card>
            <Heading>About this piece</Heading>
            <Body>{product.description}</Body>
          </Card>
        )}
        <Button
          secondary
          icon="arrow-left"
          label={product.brandName}
          onPress={() => navigate({ name: "brand", brandId: product.brandId })}
        />
        {product.moreVariants && (
          <Body>More variants exist outside this preview.</Body>
        )}
        {scoped.some((piece) => piece.id !== product.id) && <View style={{ gap: 16, paddingVertical: 16 }}>
          <ShoppingHeader eyebrow="KEEP EXPLORING" title="Another point of view." description="More pieces from this demo collection." />
          <ProductGrid products={scoped.filter((piece) => piece.id !== product.id).slice(0, 4)} onTryOn={(piece) => navigate({ name: "try-on", productId: piece.id, brandId: piece.brandId })} onView={(piece) => navigate({ name: "product", productId: piece.id, brandId: piece.brandId })} />
        </View>}
        <ShoppingNotice title="A fictional demo collection">
          This is a product photo, not a try-on result. Availability is
          fictional and demo orders stay on this device.
        </ShoppingNotice>
      </>
    );
  }
  if (route.name === "cart") {
    const lines = a.commerce.cart.filter(
      (l) => !route.brandId || l.brandId === route.brandId,
    );
    const groups = [...new Set(lines.map((l) => l.brandId || "legacy"))];
    const count = lines.reduce((n, line) => n + line.quantity, 0);
    return (
      <>
        {bagOrdersSwitch()}
        <ShoppingHeader compact
          eyebrow="Your local selection"
          title="Your bag"
          description={`${count} ${count === 1 ? "piece" : "pieces"} · Each store has a separate demo checkout.`}
        />
        {!lines.length && (
          <ShoppingEmpty compact
            title="Your bag is waiting"
            description="Find a piece you love and add your preferred variant."
            action="Discover pieces"
            onPress={() =>
              navigate({
                name: route.brandId ? "brand" : "home",
                brandId: route.brandId,
              })
            }
          />
        )}
        {groups.map((id) => {
          const group = lines.filter((l) => (l.brandId || "legacy") === id);
          return (
            <View key={id} style={{ gap: 6, marginTop: 2 }}>
              <Text accessibilityRole="header" style={{ color: palette.text, fontSize: 14, lineHeight: 20, fontWeight: "600" }}>{group[0].brandName || "Unavailable store"}</Text>
              {group.map((l, i) => cartLine(l, i))}
              <ShoppingCard>
                <Badge>Known catalogue subtotal</Badge>
                {prices(group)}
                <Button
                  label="Review demo checkout"
                  disabled={!checkoutReady(group, a.products)}
                  onPress={() => navigate({ name: "checkout", brandId: id })}
                />
                {!checkoutReady(group, a.products) && (
                  <Body>
                    Checkout requires every variant available in a single
                    currency. Re-enable or retry its store, or remove
                    unavailable items yourself.
                  </Body>
                )}
              </ShoppingCard>
            </View>
          );
        })}
        <Body>
          No combined cross-currency total, tax, shipping, reservations, or
          payments are calculated.
        </Body>
      </>
    );
  }
  if (route.name === "checkout") {
    const lines = a.commerce.cart.filter((l) => l.brandId === route.brandId);
    const ready = checkoutReady(lines, a.products);
    async function complete() {
      if (!ready || submitting.current || !route.brandId) return;
      const token = gate.current.capture();
      submitting.current = true;
      setBusy(true);
      setMessage("");
      setMessageError(true);
      try {
        const id = `DEMO-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
        const ok = await a.dispatch({
          type: "checkout",
          brandId: route.brandId,
          catalogue: a.products,
          id,
          date: new Date().toISOString(),
        });
        if (!gate.current.permits(token)) return;
        if (ok)
          navigate({ name: "order", orderId: id, brandId: route.brandId });
        else
          setMessage(
            "Order could not be recorded. Check the storage message and retry.",
          );
      } catch {
        if (gate.current.permits(token))
          setMessage("Order could not be recorded. Your cart is retained.");
      } finally {
        submitting.current = false;
        if (mounted.current) setBusy(false);
      }
    }
    return (
      <>
        <ShoppingHeader compact
          eyebrow="Local demo checkout"
          title="Review your selection"
          description={lines[0]?.brandName || "Your store selection"}
        />
        {lines.length ? (
          lines.map((l, i) => cartLine(l, i, false))
        ) : (
          <ShoppingEmpty compact
            title="No items to review"
            description="Your selection may have changed. Return to your cart to continue."
          />
        )}
        <ShoppingCard>
          <Badge>Demo order total</Badge>
          {prices(lines)}
          <ShoppingNotice compact title="No payment will be taken">
            Creates a record only on this device. No request is sent to Shopify
            or Mock Shop and no stock is reserved.
          </ShoppingNotice>
          {!ready && (
            <Body>
              Checkout unavailable. All variants must be available from this
              store in one currency.
            </Body>
          )}
          <Button
            label={busy ? "Recording…" : "Place demo order"}
            busy={busy}
            disabled={!ready || busy}
            onPress={() => {
              void complete();
            }}
          />
          <Status message={message} error={messageError} />
          <Button
            secondary
            label="Return to cart"
            disabled={busy}
            onPress={() => navigate({ name: "cart", brandId: route.brandId })}
          />
        </ShoppingCard>
      </>
    );
  }
  if (route.name === "orders" || route.name === "order") {
    const orders = a.commerce.orders;
    const order = a.commerce.orders.find((o) => o.id === route.orderId);
    if (route.name === "order")
      return (
        <>
          <ShoppingHeader compact
            eyebrow="Your local record"
            title={order ? "Demo order recorded" : "Order not found"}
            description="No payment, merchant order, shipment or tracking."
          />
          {!order && (
            <ShoppingEmpty compact
              title="This record is unavailable"
              description="It may not be stored on this device. Your other local demo orders are still available below."
            />
          )}
          {order && (
            <>
              <ShoppingCard>
                <Heading>{order.brandName || order.brandId}</Heading>
                <Body>
                  {order.id}
                  {"\n"}
                  {new Date(order.date).toLocaleString()}
                  {"\n"}
                  {order.legacy ? "Preserved historical snapshot · " : ""}
                  {order.status}
                </Body>
              </ShoppingCard>
              {order.lines.map((l, i) => (
                <ShoppingCard key={i}>
                  <ShoppingLine compact
                    image={!order.legacy ? l.image : undefined}
                    name={l.name}
                  >
                    <Body>
                      {l.size} · {l.quantity} {l.quantity === 1 ? "piece" : "pieces"}
                      {l.color ? ` · ${l.color}` : ""}
                    </Body>
                    <Body>{money(l.price * l.quantity, l.currency)}</Body>
                  </ShoppingLine>
                </ShoppingCard>
              ))}
              <ShoppingCard>
                <Badge>Recorded total</Badge>
                {totals(order.lines).map((t) => (
                  <Heading key={t.currency}>
                    {money(t.amount, t.currency)}
                  </Heading>
                ))}
              </ShoppingCard>
            </>
          )}
          <Button
            label="View demo orders"
            onPress={() => navigate({ name: "orders", brandId: route.brandId })}
          />
        </>
      );
    return (
      <>
        {bagOrdersSwitch()}
        <ShoppingHeader compact
          eyebrow="Your records"
          title="Demo orders"
          description={route.brandId ? "Your store’s records on this device. Switch to All stores for your full history. No real purchases." : "All-store history on this device, including disabled stores. No real purchases."}
        />
        <CatalogueChoices
          showLabel
          label="Filter by store"
          value={filter}
          onChange={setFilter}
          options={[
            { label: "All stores", value: "All" },
            ...[...new Set([...(route.brandId ? [route.brandId] : []), ...orders.map((o) => o.brandId)])].map((id) => ({
              value: id,
              label: orders.find((o) => o.brandId === id)?.brandName || a.brands.find(item => item.id === id)?.name || id,
            })),
          ]}
        />
        {orders
          .filter((o) => filter === "All" || o.brandId === filter)
          .map((o) => (
            <ShoppingCard key={o.id}>
              <Badge>
                {o.legacy ? "Preserved earlier demo" : "Your demo order"}
              </Badge>
              <Heading>{o.brandName || o.brandId}</Heading>
              <Body>
                {new Date(o.date).toLocaleString()} ·{" "}
                {o.lines.reduce((n, l) => n + l.quantity, 0)} pieces
              </Body>
              {totals(o.lines).map((t) => (
                <Body key={t.currency}>{money(t.amount, t.currency)}</Body>
              ))}
              <Button
                label="View order"
                onPress={() =>
                  navigate({
                    name: "order",
                    orderId: o.id,
                    brandId: route.brandId,
                  })
                }
              />
            </ShoppingCard>
          ))}
        {!orders.filter((o) => filter === "All" || o.brandId === filter)
          .length && (
          <ShoppingEmpty compact
            title={
              orders.length ? "No orders for this store" : "No demo orders yet"
            }
            description="Your recorded demo checkouts will appear here."
            action="Discover pieces"
            onPress={() =>
              navigate({
                name: route.brandId ? "brand" : "home",
                brandId: route.brandId,
              })
            }
          />
        )}
        {a.commerce.legacySamples.length > 0 && (
          <Body>
            {a.commerce.legacySamples.length} earlier seeded examples are
            retained in the backup archive and excluded here.
          </Body>
        )}
      </>
    );
  }
  if (route.name === "brand" && !brand && !a.catalogueLoading) {
    return (
      <ShoppingEmpty
        title="Store unavailable"
        description="This store may be disabled or its catalogue could not load. Your cart references are retained."
        action="Manage stores"
        onPress={() => navigate({ name: "stores" })}
      />
    );
  }
  if (route.name === "brand" && brand) return <BrandStorefront brand={brand} navigate={navigate} scrollTo={scrollTo} />;
  if (route.name === "home" && !browseOnly) return <CommerceHome navigate={navigate} onBrowse={(selection = {}) => {
    setQuery(selection.query || ""); setCategory(selection.category || "All"); setStore(selection.store || ""); setSort(selection.sort || "featured"); setMood("all"); setCurrencyFilter(selection.currency || "");
    setPriceCap(typeof selection.maxPrice === "number" && Number.isFinite(selection.maxPrice) && selection.currency ? { amount: selection.maxPrice, currency: selection.currency } : null);
    setShowFilters(!!selection.showFilters); setShowSearch(!!selection.query);
    setBrowseOnly(true); scrollTo?.(0);
  }}><ExperienceIntro compact navigate={navigate} mood={mood} onMood={setMood} onBrowse={() => { setQuery(""); setCategory("All"); setStore(""); setCurrencyFilter(""); setPriceCap(null); setSort("featured"); setShowFilters(false); setShowSearch(false); setBrowseOnly(true); scrollTo?.(0); }} /></CommerceHome>;
  const controls = route.name === "home" ? { store, sort, showStoreAndSort: true } : browseControls(route.name, store, sort);
  const list = selectProducts(route.name === "home" ? moodProducts(scoped, mood) : scoped, controls.store, query, category).filter(
    (p) => (!currencyFilter || p.variants.some(v => v.available && v.currency === currencyFilter)) && (!priceCap || p.variants.some(v => v.available && v.currency === priceCap.currency && v.amount <= priceCap.amount)),
  );
  if (controls.sort === "name")
    list.sort((a, b) => a.name.localeCompare(b.name));
  if (controls.sort === "newest")
    list.sort(
      (a, b) =>
        (Date.parse(b.createdAt || "") || 0) -
        (Date.parse(a.createdAt || "") || 0),
    );
  if (controls.sort === "price") {
    const firstPrice = (p: Product) => p.variants.filter(v => v.available && (!currencyFilter || v.currency === currencyFilter)).sort((a, b) => a.currency.localeCompare(b.currency) || a.amount - b.amount)[0];
    list.sort((a, b) => {
      const av = firstPrice(a), bv = firstPrice(b);
      return (av?.currency || "ZZZ").localeCompare(bv?.currency || "ZZZ") || (av?.amount ?? Infinity) - (bv?.amount ?? Infinity);
    });
  }
  const catalogueTitle = brand?.name || (query ? "Search results" : category !== "All" ? category : priceCap ? `Picks up to ${money(priceCap.amount, priceCap.currency)}` : mood === "all" ? "Explore all styles" : `${moods.find(item => item.id === mood)?.label}`);
  const catalogueDescription = `${list.length} demo ${list.length === 1 ? "piece" : "pieces"}${query ? ` matching “${query}”` : " to discover"}${currencyFilter ? ` · ${currencyFilter}` : ""}.`;
  const hasFilters = !!(query || category !== "All" || store || sort !== "featured" || mood !== "all" || priceCap || currencyFilter);
  const sortLabels: Record<string, string> = { name: "Name A–Z", price: "Price ↑ · by currency", newest: "Newest" };
  const activeSummary = [
    query ? `Search: “${query}”` : "",
    category !== "All" ? category : "",
    store ? a.brands.find(item => item.id === store)?.name || store : "",
    sort !== "featured" ? sortLabels[sort] || sort : "",
    mood !== "all" ? moods.find(item => item.id === mood)?.label || mood : "",
    currencyFilter,
    priceCap ? `Up to ${money(priceCap.amount, priceCap.currency)}` : "",
  ].filter(Boolean);
  const activeOptions = activeSummary.length;
  const currencies = [...new Set(scoped.flatMap(p => p.variants.map(v => v.currency)))].sort();
  function clearFilters() {
    setQuery(""); setMood("all"); setPriceCap(null); setCurrencyFilter(""); setCategory("All"); setStore(""); setSort("featured");
  }
  return (
    <>
      <View testID="catalogue-controls" style={{ gap: 2 }}>
        <View testID="catalogue-header" style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 48 }}>
          {route.name === "home" && browseOnly && <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to home"
            onPress={() => { setBrowseOnly(false); clearFilters(); setShowFilters(false); setShowSearch(false); scrollTo?.(0); }}
            style={({ pressed }) => ({ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center", opacity: pressed ? .65 : 1 })}
          ><Icon name="arrow-left" size={18} color={palette.accent} /></Pressable>}
          <Text testID="catalogue-title" accessibilityRole="header" style={{ flex: 1, minWidth: 0, color: palette.text, fontSize: 16, lineHeight: 22, fontWeight: "700" }}>{catalogueTitle}</Text>
          <View accessibilityLabel={catalogueDescription} accessible style={{ flexShrink: 1, alignItems: "flex-end", gap: 0 }}>
            <Text testID="catalogue-count" style={{ color: palette.text, fontSize: 12, lineHeight: 17, fontWeight: "600", textAlign: "right" }}>{list.length} {list.length === 1 ? "piece" : "pieces"}</Text>
            <Text style={{ color: palette.muted, fontSize: 11, lineHeight: 16, textAlign: "right" }}>Demo{currencyFilter ? ` · ${currencyFilter}` : ""}</Text>
          </View>
          <Pressable
            testID="catalogue-search-toggle"
            accessibilityRole="button"
            accessibilityLabel={showSearch ? "Hide catalogue search" : "Search catalogue"}
            accessibilityHint="Show or hide search without clearing the current query."
            accessibilityState={{ expanded: showSearch }}
            onPress={() => setShowSearch(value => !value)}
            style={({ pressed }) => ({ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center", opacity: pressed ? .65 : 1 })}
          ><Icon name="search" size={19} color={palette.accent} /></Pressable>
        </View>
        {showSearch && <View testID="catalogue-search-row" style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Field
              testID="catalogue-search-input"
              label="Search catalogue"
              compact
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder="Search styles, stores…"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              style={{ minHeight: 48, fontSize: 13, lineHeight: 18, paddingVertical: 5 }}
            />
          </View>
          {!!query && <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear catalogue search"
            onPress={() => setQuery("")}
            style={({ pressed }) => ({ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center", opacity: pressed ? .65 : 1 })}
          ><Icon name="x" size={18} color={palette.accent} /></Pressable>}
        </View>}
        <View testID="catalogue-category-filter-row" style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <CatalogueChoices
              label="Category"
              value={category}
              onChange={setCategory}
              options={["All", ...new Set(scoped.map(p => p.category).filter(Boolean))].map(c => ({ value: c, label: c }))}
            />
          </View>
          {controls.showStoreAndSort && <Pressable
            accessibilityRole="button"
            accessibilityLabel="Filters & sort"
            accessibilityHint="Show or hide store, sort and currency choices."
            accessibilityState={{ expanded: showFilters }}
            accessibilityValue={{ text: activeOptions ? `${activeOptions} active` : "No active filters" }}
            onPress={() => setShowFilters(value => !value)}
            style={({ pressed }) => ({ minHeight: 48, minWidth: 48, paddingVertical: 4, alignItems: "center", justifyContent: "center", opacity: pressed ? .65 : 1 })}
          >
            <View style={{ minHeight: 30, minWidth: 38, borderRadius: 16, borderWidth: 1, borderColor: showFilters || activeOptions ? palette.accent : palette.line, backgroundColor: showFilters || activeOptions ? palette.tint : palette.surface, alignItems: "center", justifyContent: "center" }}>
              <Icon name="sliders" size={17} color={palette.accent} />
              {!!activeOptions && <View accessible={false} style={{ position: "absolute", top: 4, right: 4, width: 5, height: 5, borderRadius: 3, backgroundColor: palette.accent }} />}
            </View>
          </Pressable>}
        </View>
        {hasFilters && <View testID="catalogue-active-filters" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text accessibilityLiveRegion="polite" style={{ flex: 1, minWidth: 0, color: palette.muted, fontSize: 12, lineHeight: 18 }}>{activeSummary.join(" · ")}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear filters"
            accessibilityHint="Reset search, category, store, sort, mood, currency and price range."
            onPress={clearFilters}
            style={({ pressed }) => ({ minWidth: 48, minHeight: 48, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", opacity: pressed ? .65 : 1 })}
          ><Text style={{ color: palette.accent, fontSize: 12, lineHeight: 18, fontWeight: "600" }}>Clear</Text></Pressable>
        </View>}
        {showFilters && controls.showStoreAndSort && <View testID="catalogue-filter-options" style={{ paddingTop: 4, borderTopWidth: 1, borderColor: palette.line, gap: 2 }}>
          {!route.brandId && <CatalogueChoices
            showLabel
            label="Store"
            value={store}
            onChange={setStore}
            options={[{ label: "All onboarded stores", value: "" }, ...a.brands.map(b => ({ value: b.id, label: b.name }))]}
          />}
          <CatalogueChoices
            showLabel
            label="Sort products"
            value={sort}
            onChange={setSort}
            options={[
              { value: "featured", label: "Catalogue order" },
              { value: "name", label: "Name A–Z" },
              { value: "price", label: "Price ↑ · by currency" },
              ...(scoped.some(p => p.createdAt) ? [{ value: "newest", label: "Newest" }] : []),
            ]}
          />
          <CatalogueChoices
            showLabel
            label="Currency"
            value={currencyFilter}
            onChange={value => { setCurrencyFilter(value); if (priceCap && value !== priceCap.currency) setPriceCap(null); }}
            options={[{ label: "All currencies", value: "" }, ...currencies.map(value => ({ label: value, value }))]}
          />
          {priceCap && <Pressable accessibilityRole="button" accessibilityLabel="Remove price limit" onPress={() => setPriceCap(null)} style={({ pressed }) => ({ minHeight: 48, minWidth: 48, justifyContent: "center", opacity: pressed ? .65 : 1 })}><Text style={{ color: palette.accent, fontSize: 12, lineHeight: 18 }}>Remove limit of {money(priceCap.amount, priceCap.currency)}</Text></Pressable>}
        </View>}
      </View>
      <ProductGrid
        products={list}
        onTryOn={(p) => navigate({ name: "try-on", productId: p.id, brandId: p.brandId })}
        onView={(p) =>
          navigate({ name: "product", productId: p.id, brandId: p.brandId })
        }
      />
      {!list.length && !a.catalogueLoading && (
        <ShoppingEmpty
          title={a.registrations.some((s) => s.enabled) ? "No matching pieces" : "Your centre starts here"}
          description="Choose a demo store or adjust your filters to explore its collection."
          action="Manage demo stores"
          onPress={() => navigate({ name: "stores" })}
        />
      )}
      {a.brands.some((b) => b.more) && (
        <Body>
          Bounded preview: up to 48 products per store. Additional products may
          exist.
        </Body>
      )}
      <Body>
        Public fictional catalogues. No real purchases. Saved-photo try-on
        requires configured backend services.
      </Body>
    </>
  );
}

/** Native full-screen vertical paging. The photo identity survives viewport changes. */
function CatalogueViewer({ route, navigate, back }: Props) {
  const close = () =>
    route.productId
      ? navigate({
          name: "product",
          productId: route.productId,
          brandId: route.brandId,
        })
      : back();
  const a = useApp(),
    palette = usePalette(),
    insets = useSafeAreaInsets(),
    window = useWindowDimensions();
  const initial = a.products.find((p) => p.id === route.productId);
  const photos = a.products.filter(
    (p) => p.brandId === (initial?.brandId || route.brandId) && !!p.image,
  );
  const [selectedId, setSelectedId] = useState(route.productId);
  const [height, setHeight] = useState(window.height);
  const list = useRef<FlatList<Product>>(null);
  const index = Math.max(
    0,
    photos.findIndex((p) => p.id === selectedId),
  );
  const selected = photos[index];
  const selectedIndex = useRef(index);
  selectedIndex.current = index;
  const photoIds = photos.map((p) => p.id).join("|");
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      list.current?.scrollToOffset({
        offset: selectedIndex.current * height,
        animated: false,
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [height, window.width, photoIds]);
  function move(next: number) {
    const i = Math.max(0, Math.min(photos.length - 1, next));
    if (photos[i]) {
      setSelectedId(photos[i].id);
      selectedIndex.current = i;
      list.current?.scrollToOffset({ offset: i * height, animated: false });
    }
  }
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingBottom: 8,
          paddingLeft: Math.max(16, insets.left),
          paddingRight: Math.max(16, insets.right),
          borderBottomWidth: 1,
          borderBottomColor: palette.line,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Button
            secondary
            icon="x"
            label="Close"
            accessibilityLabel="Close catalogue photos"
            onPress={close}
          />
          <Text
            accessibilityLiveRegion="polite"
            style={{
              color: palette.muted,
              fontSize: 14,
              lineHeight: 20,
              flexShrink: 1,
            }}
          >
            {selected ? `${index + 1} of ${photos.length}` : "Catalogue photos"}
          </Text>
        </View>
      </View>
      {!!photos.length && (
        <View
          style={{ flex: 1, minHeight: 0 }}
          onLayout={(e) => setHeight(Math.max(1, e.nativeEvent.layout.height))}
        >
          <FlatList
            ref={list}
            data={photos}
            keyExtractor={(p) => p.id}
            style={{ flex: 1 }}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            initialScrollIndex={Math.max(
              0,
              photos.findIndex((p) => p.id === route.productId),
            )}
            getItemLayout={(_, i) => ({
              length: height,
              offset: height * i,
              index: i,
            })}
            extraData={height}
            windowSize={3}
            initialNumToRender={2}
            maxToRenderPerBatch={3}
            onMomentumScrollEnd={(e) => {
              const i = Math.max(
                0,
                Math.min(
                  photos.length - 1,
                  Math.round(e.nativeEvent.contentOffset.y / height),
                ),
              );
              if (photos[i]) setSelectedId(photos[i].id);
            }}
            onScrollToIndexFailed={({ index: i }) =>
              list.current?.scrollToOffset({
                offset: i * height,
                animated: false,
              })
            }
            renderItem={({ item }) => (
              <View
                style={{
                  height,
                  paddingVertical: 8,
                  paddingLeft: Math.max(12, insets.left),
                  paddingRight: Math.max(12, insets.right),
                  justifyContent: "center",
                }}
              >
                <Photo
                  key={item.image}
                  uri={item.image}
                  label={item.name}
                  height={Math.max(1, height - 16)}
                  contain
                />
              </View>
            )}
          />
        </View>
      )}
      {!photos.length && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingTop: 24,
            paddingLeft: Math.max(24, insets.left),
            paddingRight: Math.max(24, insets.right),
            paddingBottom: insets.bottom + 24,
            gap: 16,
          }}
        >
          {a.catalogueLoading ? (
            <>
              <ActivityIndicator accessibilityLabel="Loading catalogue photos" />
              <Body>Loading catalogue photos…</Body>
            </>
          ) : (
            <ShoppingEmpty
              title="No catalogue photo available"
              description="The store may be disabled or its catalogue unavailable."
            />
          )}
          <Status message={a.catalogueError} error />
          <Button
            label="Retry catalogue"
            onPress={() => {
              void a.reload();
            }}
          />
        </ScrollView>
      )}
      {selected && (
        <ScrollView
          style={{
            flexGrow: 0,
            flexShrink: 1,
            maxHeight: window.height * 0.44,
            borderTopWidth: 1,
            borderTopColor: palette.line,
          }}
          contentContainerStyle={{
            padding: 16,
            paddingLeft: Math.max(16, insets.left),
            paddingRight: Math.max(16, insets.right),
            paddingBottom: insets.bottom + 12,
            gap: 10,
          }}
        >
          <View style={{ gap: 4 }}>
            <Heading>{selected.name}</Heading>
            <Body>{selected.brandName}</Body>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button
              secondary
              icon="arrow-up"
              label="Previous"
              accessibilityLabel="Previous catalogue photo"
              style={{ flex: 1 }}
              disabled={index === 0}
              onPress={() => move(index - 1)}
            />
            <Button
              icon="arrow-down"
              label="Next"
              accessibilityLabel="Next catalogue photo"
              style={{ flex: 1 }}
              disabled={index >= photos.length - 1}
              onPress={() => move(index + 1)}
            />
          </View>
          <Body>
            Catalogue photo · Not a try-on result. Swipe up or down to explore.
          </Body>
        </ScrollView>
      )}
    </View>
  );
}
