import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import {
  NavigationContainer,
  createNavigationContainerRef,
  DarkTheme,
  DefaultTheme,
} from "@react-navigation/native";
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from "@react-navigation/native-stack";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import { AppProvider, useApp } from "./src/state";
import { ShoppingScreen } from "./src/ShoppingScreens";
import { SettingsScreen } from "./src/SettingsScreens";
import { AccountScreen } from "./src/AccountScreens";
import {
  Body,
  BottomOverlayProvider,
  Button,
  Icon,
  IconButton,
  PaletteProvider,
  Screen,
  Title,
  usePalette,
} from "./src/ui";
import { brandExperience } from "./src/brandExperience";
import { BrandMark } from "./src/BrandMark";
import { bottomNavFrame, isRootTab, tabDestination, tryOnDestination, type BottomTabName } from "./src/shellPresentation";
import { NavBar } from "./src/NavBar";
import { StyleAssistant } from "./src/StyleAssistant";
import {
  cleanRoute,
  parseLink,
  routeNames,
  scopeRoute,
  type Route,
  type RouteName,
} from "./src/navigation";

type Params = Omit<Route, "name">;
type Routes = { [K in RouteName]: Params | undefined };
const Stack = createNativeStackNavigator<Routes>();
const navigationRef = createNavigationContainerRef<Routes>();
const labels: Record<RouteName, string> = {
  home: "Fashion Centre",
  brands: "Stores",
  brand: "Brand Centre",
  stores: "Demo stores",
  product: "The collection",
  cart: "Bag & orders",
  checkout: "Demo checkout",
  orders: "Bag & orders",
  order: "Order record",
  profile: "Your space",
  settings: "Settings",
  owner: "For brands",
  login: "Your account",
  "login-demo": "OTP simulation",
  prepare: "Photo preparation",
  photos: "Catalogue photos",
  "try-on": "Saved-photo try-on",
};

function Shell(props: NativeStackScreenProps<Routes>) {
  const app = useApp();
  const route = cleanRoute({ ...props.route.params, name: props.route.name as RouteName });
  const brand = app.brands.find(item => item.id === route.brandId);
  return <PaletteProvider palette={brand ? brandExperience(brand.id, app.theme).palette : undefined}><ShellContent {...props} /></PaletteProvider>;
}

function ShellContent({
  route: nativeRoute,
  navigation,
}: NativeStackScreenProps<Routes>) {
  const app = useApp(),
    palette = usePalette(),
    insets = useSafeAreaInsets();
  const { width: viewportWidth, height: viewportHeight, fontScale } = useWindowDimensions();
  const route = cleanRoute({
    ...nativeRoute.params,
    name: nativeRoute.name as RouteName,
  });
  const go = (next: Route) => {
    const scoped = scopeRoute(next, route),
      { name, ...params } = scoped;
    if (["cart", "orders"].includes(route.name) && ["cart", "orders"].includes(name)) {
      // These are two views of one Bag destination, not a growing tab stack.
      if (name !== route.name || scoped.brandId !== route.brandId) navigation.replace(name, params);
      return;
    }
    if (route.name === "photos" && name === "product") {
      navigation.popTo("product", params);
      return;
    }
    navigation.navigate(name, params);
  };
  const back = () =>
    route.name === "photos" && route.productId
      ? navigation.popTo("product", {
          productId: route.productId,
          brandId: route.brandId,
        })
      : navigation.canGoBack()
        ? navigation.goBack()
        : route.name === "settings"
          ? navigation.replace("profile", route.brandId ? { brandId: route.brandId } : {})
          : navigation.replace("home");
  const brand = app.brands.find((b) => b.id === route.brandId);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  function switchTab(name: BottomTabName) {
    const { name: destination, ...params } = tabDestination(name, route);
    Keyboard.dismiss();
    if (
      destination === route.name &&
      JSON.stringify(params) === JSON.stringify(nativeRoute.params || {})
    )
      return;
    navigation.reset({ index: 0, routes: [{ name: destination, params }] });
  }
  const openTryOn = () => {
    Keyboard.dismiss();
    const { name, ...params } = tryOnDestination(route, app.products, app.brands);
    // This is an action, not a root-tab switch: Back returns to this screen.
    // Use the validated destination directly instead of inheriting stale scope.
    navigation.navigate(name, params);
  };
  const exitStore = () => navigation.reset({ index: 0, routes: [{ name: "home" }] });
  const brandRoot = route.name === "brand" || route.name === "home";
  useEffect(() => {
    const identity = brand ? brandExperience(brand.id, app.theme) : undefined;
    navigation.setOptions({
      title: brand ? brand.name : labels[route.name],
      headerStyle: { backgroundColor: palette.surface },
      headerTintColor: palette.text,
      headerTitleStyle: { fontSize: 16, fontWeight: "700" },
      contentStyle: { backgroundColor: palette.background },
      // One compact header owns back, store identity, switch and exit. No second store bar.
      header: () => (
        <PaletteProvider palette={palette}><View style={{ paddingTop: insets.top, paddingLeft: Math.max(8, insets.left), paddingRight: Math.max(8, insets.right), backgroundColor: route.name === "home" && !route.brandId ? palette.tint : palette.surface, borderBottomWidth: route.name === "home" && !route.brandId ? 0 : 1, borderColor: palette.line }}>
          <View testID="compact-shell-header" style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 4 }}>
            {!!route.brandId && brandRoot ? (
              <IconButton name="arrow-left" label="Exit store view and return to Fashion Centre" onPress={exitStore} />
            ) : !isRootTab(route.name) || !!route.brandId ? (
              <IconButton name="arrow-left" label="Go back" onPress={back} />
            ) : null}
            {!!brand && <BrandMark id={brand.id} name={brand.name} size={24} />}
            <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 4, paddingVertical: 5 }}>
              <Text accessibilityRole="header" style={{ color: palette.text, fontSize: 16, lineHeight: 20, fontWeight: "700", fontFamily: brandRoot && identity?.serif ? Platform.OS === "ios" ? "Georgia" : "serif" : undefined }}>{brand?.name || labels[route.name]}</Text>
              {!!route.brandId && !brandRoot && <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 16 }}>{labels[route.name]}</Text>}
            </View>
            {route.name === "profile" && <IconButton name="settings" label="Open settings" onPress={() => go({ name: "settings" })} />}
            {!!route.brandId && <IconButton name="grid" label={`Switch store, current store ${brand?.name || route.brandId}`} onPress={() => go({ name: "brands" })} />}
            {!!route.brandId && !brandRoot && <IconButton name="home" label="Exit store view and return to Fashion Centre" onPress={exitStore} />}
          </View>
        </View></PaletteProvider>
      ),
    });
  }, [navigation, route.name, route.brandId, route.productId, brand?.name, app.theme, palette.surface, palette.text, palette.background, palette.line, palette.tint, palette.accent, palette.muted, insets.top, insets.left, insets.right]);
  const showTabs = ![
    "login",
    "login-demo",
    "try-on",
    "prepare",
    "photos",
    "checkout",
  ].includes(route.name);
  const dockVisible = showTabs && !keyboardVisible;
  const dockHeight = dockVisible ? bottomNavFrame(viewportWidth, fontScale, insets).footprint : 0;
  const isAccount = ["login", "login-demo", "prepare", "try-on"].includes(
    route.name,
  );
  if (route.name === "photos" && app.ready)
    return <ShoppingScreen route={route} navigate={go} back={back} />;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: palette.background,
        paddingTop: route.name === "photos" ? insets.top : 0,
      }}
    >
      {(!isAccount || !!app.error || !!app.notice) && (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
          style={{
            flexGrow: 0,
            flexShrink: 1,
            maxHeight: Math.max(100, Math.min(220, viewportHeight * 0.28)),
          }}
          contentContainerStyle={{ flexGrow: 0 }}
        >
          {!isAccount && (
            <View
              style={{
                paddingHorizontal: Math.max(16, insets.left, insets.right),
                paddingVertical: 1,
                backgroundColor: palette.tint,
                flexDirection: "row",
                gap: 6,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="info" size={12} color={palette.muted} />
              <Text
                style={{
                  color: palette.muted,
                  fontSize: 12,
                  lineHeight: 16,
                  textAlign: "center",
                  flexShrink: 1,
                }}
              >
                Demo catalogues · No live purchases
              </Text>
            </View>
          )}
          {!!app.error && (
            <View
              accessibilityRole="alert"
              style={{
                paddingVertical: 12,
                paddingLeft: Math.max(16, insets.left),
                paddingRight: Math.max(16, insets.right),
                gap: 10,
                backgroundColor: palette.tint,
              }}
            >
              <Text style={{ color: palette.error }}>{app.error}</Text>
              <Button
                secondary
                label="Reload device data"
                onPress={() => {
                  void app.reload();
                }}
              />
            </View>
          )}
          {!!app.notice && (
            <View
              accessibilityLiveRegion="polite"
              style={{
                paddingLeft: Math.max(16, insets.left),
                paddingRight: Math.max(8, insets.right),
                paddingVertical: 4,
                backgroundColor: palette.tint,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Icon name="check-circle" size={18} color={palette.accent} />
              <Text
                style={{
                  color: palette.text,
                  fontSize: 14,
                  lineHeight: 21,
                  flex: 1,
                }}
              >
                {app.notice}
              </Text>
              <IconButton
                name="x"
                label="Dismiss notification"
                onPress={app.clearNotice}
              />
            </View>
          )}
        </ScrollView>
      )}
      <BottomOverlayProvider height={dockHeight}>
      {!app.ready ? (
        <Screen>
          <Title>Opening your centre.</Title>
          {!app.error && <ActivityIndicator color={palette.accent} />}
          <Body>Loading your private shopping records from this device.</Body>
        </Screen>
      ) : isAccount ? (
        <AccountScreen route={route} navigate={go} back={back} />
      ) : route.name === "profile" || route.name === "settings" || route.name === "owner" ? (
        <SettingsScreen route={route} navigate={go} back={back} />
      ) : (
        <ShoppingScreen route={route} navigate={go} back={back} />
      )}
      </BottomOverlayProvider>
      {dockVisible && (
        <View testID="shell-bottom-overlay" pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 20 }}>
        <NavBar
          route={route}
          bagQuantity={app.commerce.cart
            .filter(line => !route.brandId || line.brandId === route.brandId)
            .reduce((count, line) => count + line.quantity, 0)}
          onSelectTab={switchTab}
          onTryOn={openTryOn}
          accessory={<StyleAssistant products={app.products} onNavigate={go} brandId={route.brandId} currentProductId={route.productId} catalogueLoading={app.catalogueLoading} catalogueError={app.catalogueError} launcherMode="inline" />}
        />
        </View>
      )}
    </View>
  );
}

function Navigator() {
  const app = useApp(),
    p = usePalette();
  const pendingLink = useRef<Route | null>(null);
  function openLink(route: Route) {
    if (!navigationRef.isReady()) {
      pendingLink.current = route;
      return;
    }
    const { name, ...params } = route;
    if (name === "photos" && route.productId)
      navigationRef.navigate("product", {
        productId: route.productId,
        brandId: route.brandId,
      });
    navigationRef.navigate(name, params);
  }
  useEffect(() => {
    let active = true;
    void Linking.getInitialURL().then((url) => {
      const route = url && parseLink(url);
      if (active && route) openLink(route);
    });
    const sub = Linking.addEventListener("url", ({ url }) => {
      const route = parseLink(url);
      if (route) openLink(route);
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
  const theme = app.theme === "dark" ? DarkTheme : DefaultTheme;
  return (
    <>
      <StatusBar style={app.theme === "dark" ? "light" : "dark"} />
      <NavigationContainer
        ref={navigationRef}
        theme={{
          ...theme,
          colors: {
            ...theme.colors,
            background: p.background,
            card: p.surface,
            text: p.text,
            primary: p.accent,
            border: p.line,
          },
        }}
        onReady={() => {
          if (pendingLink.current) {
            openLink(pendingLink.current);
            pendingLink.current = null;
          }
        }}
      >
        <Stack.Navigator
          initialRouteName="home"
          screenOptions={{
            headerStyle: { backgroundColor: p.surface },
            headerTintColor: p.text,
            headerTitleStyle: { fontWeight: "700", fontSize: 18 },
            headerTitleAlign: "left",
            headerShadowVisible: false,
            headerBackButtonDisplayMode: "minimal",
            contentStyle: { backgroundColor: p.background },
            animation: "slide_from_right",
          }}
        >
          {routeNames.map((name) => (
            <Stack.Screen
              key={name}
              name={name}
              component={Shell}
              options={({ navigation }) => ({
                title: labels[name],
                headerShown: name !== "photos",
                headerBackVisible: !isRootTab(name),
                ...(!isRootTab(name) &&
                name !== "photos" &&
                !navigation.canGoBack()
                  ? {
                      headerLeft: () => (
                        <IconButton
                          name="arrow-left"
                          label="Back to Fashion Centre"
                          onPress={() => navigation.replace("home")}
                        />
                      ),
                    }
                  : {}),
              })}
            />
          ))}
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            padding: 28,
            backgroundColor: "#FAF7F2",
          }}
        >
          <Text style={{ fontSize: 24, color: "#291D35", marginBottom: 16 }}>
            Fashion Centre could not open.
          </Text>
          <Text style={{ color: "#776A80" }}>
            Close and reopen the app to reload your device data. Your saved
            records have not been cleared.
          </Text>
        </View>
      );
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AppProvider>
          <Navigator />
        </AppProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
