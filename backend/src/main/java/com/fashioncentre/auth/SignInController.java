//package com.fashioncentre.auth;
//
//import jakarta.servlet.http.Cookie;
//import jakarta.servlet.http.HttpServletRequest;
//import java.net.URI;
//import java.time.Duration;
//import java.util.Arrays;
//import java.util.Map;
//import org.springframework.http.CacheControl;
//import org.springframework.http.HttpHeaders;
//import org.springframework.http.HttpStatus;
//import org.springframework.http.ResponseEntity;
//import org.springframework.util.MultiValueMap;
//import org.springframework.web.bind.annotation.*;
//import org.springframework.web.server.ResponseStatusException;
//
//@RestController
//@RequestMapping("/api/auth/sign-in")
//class SignInController {
//    private final SignInProviders providers;
//    private final SignInStore store;
//    SignInController(SignInProviders providers, SignInStore store) { this.providers = providers; this.store = store; }
//
//    record Start(String platform, String shop, String returnTo) {}
//    record Finish(String grant, String verifier) {}
//
//
//    @PostMapping("/{provider}/start")
//    ResponseEntity<?> start(@PathVariable String provider, @RequestBody Start input) {
//        String origin = providers.origin(provider);
//        String shop = "shopify".equals(provider) ? SignInProviders.shop(input.shop()) : null;
//        boolean nativeApp = "native".equals(input.platform());
//        if (!nativeApp && !"web".equals(input.platform())) throw SignInStore.invalid();
//        String verifier = nativeApp ? SignInStore.token() : null;
//        String url = origin + SignInProviders.BASE + provider + "/browser?platform=" + input.platform()
//                + (nativeApp ? "&challenge=" + SignInStore.challenge(verifier) : "") + (shop == null ? "" : "&shop=" + shop);
//        return response(200).body(nativeApp ? Map.of("url", url, "verifier", verifier) : Map.of("url", url));
//    }
//
//    @GetMapping("/{provider}/browser")
//    ResponseEntity<?> browser(@PathVariable String provider, @RequestParam String platform,
//                              @RequestParam(required = false) String challenge, @RequestParam(required = false) String shop) {
//        providers.origin(provider);
//        if (!("native".equals(platform) && SignInStore.validToken(challenge) || "web".equals(platform) && challenge == null))
//            throw SignInStore.invalid();
//        String domain = "shopify".equals(provider) ? SignInProviders.shop(shop) : null;
//        String state = SignInStore.token(), key = SignInStore.token();
//        store.begin(state, key, provider, challenge, domain);
//        return response(303).location(providers.authorization(provider, domain, state, key))
//                .header(HttpHeaders.SET_COOKIE, bindingCookie(state, key, SignInStore.FLOW_TTL)).build();
//    }
//
//    @RequestMapping(value = "/{provider}/callback", method = {RequestMethod.GET, RequestMethod.POST})    ResponseEntity<?> callback(@PathVariable String provider, @RequestParam MultiValueMap<String,String> params, HttpServletRequest request) {
//        String origin = providers.origin(provider);
//        if (params.size() > 20 || params.values().stream().anyMatch(v -> v.size() != 1 || v.get(0).length() > 4096))
//            throw SignInStore.invalid();
//        String state = params.getFirst("state");
//        if (!SignInStore.validToken(state)) throw SignInStore.invalid();
//        String name = bindingName(state);
//        String key = request.getCookies() == null ? null : Arrays.stream(request.getCookies())
//                .filter(c -> name.equals(c.getName())).map(Cookie::getValue).findFirst().orElse(null);
//        var flow = store.claim(state, key, provider);
//        var redirect = response(303).header(HttpHeaders.SET_COOKIE, bindingCookie(state, "", Duration.ZERO));
//        String webRoute = "shopify".equals(provider) ? "#/owner" : "#/login";
//        String result = "cancelled";
//        if (!params.containsKey("error")) {
//            SignInProviders.Identity identity = null;
//            try {
//                identity = providers.exchange(provider, flow.shop(), params.toSingleValueMap(), key);
//            } catch (RuntimeException providerFailure) {
//                // Provider exceptions can contain response bodies or codes. Only a generic status leaves this boundary.
//                result = "failed";
//            }
//            if (identity != null) {
//                if (flow.challenge() != null) {
//                    String grant = store.grant(flow, identity);
//                    return redirect.location(URI.create(SignInProviders.APP_RETURN + "?grant=" + grant)).build();
//                }
//                setSession(redirect, store.session(provider, flow.shop(), identity));
//                result = "success";
//            }
//        }
//        String target = flow.challenge() == null ? origin + "/?signin=" + result + webRoute
//                : SignInProviders.APP_RETURN + "?signin=" + result;
//        return redirect.location(URI.create(target)).build();
//    }
//
//    @PostMapping("/{provider}/finish")
//    ResponseEntity<?> finish(@PathVariable String provider, @RequestBody Finish input) {
//        providers.origin(provider);
//        return setSession(response(204), store.finish(provider, input.grant(), input.verifier())).build();
//    }
//
//    @GetMapping("/shopify/me")
//    ResponseEntity<?> merchant(@CookieValue(name=SignInStore.MERCHANT_COOKIE, required=false) String token) {
//        String shop = store.merchant(token).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
//        return response(200).body(Map.of("shop", shop));
//    }
//
//    @PostMapping("/shopify/logout")
//    ResponseEntity<?> logout(@CookieValue(name=SignInStore.MERCHANT_COOKIE, required=false) String token) {
//        store.logoutMerchant(token);
//        return response(204).header(HttpHeaders.SET_COOKIE,
//                AuthController.sessionCookie(SignInStore.MERCHANT_COOKIE, "", Duration.ZERO, "/").toString()).build();
//    }
//
//    private static ResponseEntity.BodyBuilder setSession(ResponseEntity.BodyBuilder response, SignInStore.Session session) {
//        return response.header(HttpHeaders.SET_COOKIE, AuthController.sessionCookie(session.cookie(), session.token(), session.ttl(), "/").toString());
//    }
//
//    private static String bindingName(String state) { return "fc_oauth_" + state.substring(0,16); }
//    private static String bindingCookie(String state, String value, Duration ttl) {
//        return AuthController.sessionCookie(bindingName(state), value, ttl, SignInProviders.BASE).toString();
//    }
//
//    private static ResponseEntity.BodyBuilder response(int status) {
//        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).header("Referrer-Policy", "no-referrer");
//    }
//}

package com.fashioncentre.auth;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.time.Duration;
import java.util.Arrays;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth/sign-in")
class SignInController {
    private final SignInProviders providers;
    private final SignInStore store;

    SignInController(SignInProviders providers, SignInStore store) {
        this.providers = providers;
        this.store = store;
    }

    record Start(String platform, String shop, String returnTo) {}
    record Finish(String grant, String verifier) {}

    @PostMapping("/{provider}/start")
    ResponseEntity<?> start(@PathVariable String provider, @RequestBody Start input) {
        String origin = providers.origin(provider);
        String shop = "shopify".equals(provider) ? SignInProviders.shop(input.shop()) : null;
        boolean nativeApp = "native".equals(input.platform());
        if (!nativeApp && !"web".equals(input.platform())) throw SignInStore.invalid();
        String verifier = nativeApp ? SignInStore.token() : null;
        String returnTo = nativeApp ? providers.validReturn(input.returnTo()) : null;
        String url = origin + SignInProviders.BASE + provider + "/browser?platform=" + input.platform()
                + (nativeApp
                ? "&challenge=" + SignInStore.challenge(verifier) + "&return=" + SignInProviders.encode(returnTo)
                : "")
                + (shop == null ? "" : "&shop=" + shop);
        return response(200).body(nativeApp ? Map.of("url", url, "verifier", verifier) : Map.of("url", url));
    }

    @GetMapping("/{provider}/browser")
    ResponseEntity<?> browser(@PathVariable String provider,
                              @RequestParam String platform,
                              @RequestParam(required = false) String challenge,
                              @RequestParam(name = "return", required = false) String returnTo,
                              @RequestParam(required = false) String shop) {
        providers.origin(provider);
        boolean nativeApp = "native".equals(platform);
        if (!(nativeApp && SignInStore.validToken(challenge) && returnTo != null
                || "web".equals(platform) && challenge == null && returnTo == null))
            throw SignInStore.invalid();
        String target = nativeApp ? providers.validReturn(returnTo) : null;
        String domain = "shopify".equals(provider) ? SignInProviders.shop(shop) : null;
        String state = SignInStore.token(), key = SignInStore.token();
        store.begin(state, key, provider, challenge, domain, target);
        return response(303).location(providers.authorization(provider, domain, state, key))
                .header(HttpHeaders.SET_COOKIE, bindingCookie(provider, state, key, SignInStore.FLOW_TTL).toString())
                .build();
    }

    // Apple returns with response_mode=form_post, which is a cross-site POST. Google uses GET.
    @RequestMapping(value = "/{provider}/callback", method = {RequestMethod.GET, RequestMethod.POST})
    ResponseEntity<?> callback(@PathVariable String provider,
                               @RequestParam MultiValueMap<String, String> params,
                               HttpServletRequest request) {
        String origin = providers.origin(provider);
        if (params.size() > 20 || params.values().stream().anyMatch(v -> v.size() != 1 || v.get(0).length() > 4096))
            throw SignInStore.invalid();
        String state = params.getFirst("state");
        if (!SignInStore.validToken(state)) throw SignInStore.invalid();
        String name = bindingName(state);
        String key = request.getCookies() == null ? null : Arrays.stream(request.getCookies())
                .filter(c -> name.equals(c.getName())).map(Cookie::getValue).findFirst().orElse(null);
        var flow = store.claim(state, key, provider);
        var redirect = response(303)
                .header(HttpHeaders.SET_COOKIE, bindingCookie(provider, state, "", Duration.ZERO).toString());
        String webRoute = "shopify".equals(provider) ? "#/owner" : "#/login";
        String result = "cancelled";
        if (!params.containsKey("error")) {
            SignInProviders.Identity identity = null;
            try {
                identity = providers.exchange(provider, flow.shop(), params.toSingleValueMap(), key);
            } catch (RuntimeException providerFailure) {
                // Provider errors can carry response bodies. Only a generic status leaves this boundary.
                result = "failed";
            }
            if (identity != null) {
                if (flow.challenge() != null) {
                    String grant = store.grant(flow, identity);
                    return redirect.location(URI.create(flow.returnTo() + "?grant=" + grant)).build();
                }
                setSession(redirect, store.session(provider, flow.shop(), identity));
                result = "success";
            }
        }

        String target = flow.challenge() == null
                ? origin + "/?signin=" + result + webRoute
                : flow.returnTo() + "?signin=" + result;
        return redirect.location(URI.create(target)).build();
    }

    @PostMapping("/{provider}/finish")
    ResponseEntity<?> finish(@PathVariable String provider, @RequestBody Finish input) {
        providers.origin(provider);
        return setSession(response(204), store.finish(provider, input.grant(), input.verifier())).build();
    }

    @GetMapping("/shopify/me")
    ResponseEntity<?> merchant(@CookieValue(name = SignInStore.MERCHANT_COOKIE, required = false) String token) {
        String shop = store.merchant(token).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        return response(200).body(Map.of("shop", shop));
    }

    @PostMapping("/shopify/logout")
    ResponseEntity<?> logout(@CookieValue(name = SignInStore.MERCHANT_COOKIE, required = false) String token) {
        store.logoutMerchant(token);
        return response(204).header(HttpHeaders.SET_COOKIE,
                AuthController.sessionCookie(SignInStore.MERCHANT_COOKIE, "", Duration.ZERO, "/").toString()).build();
    }

    private static ResponseEntity.BodyBuilder setSession(ResponseEntity.BodyBuilder response, SignInStore.Session session) {
        return response.header(HttpHeaders.SET_COOKIE,
                AuthController.sessionCookie(session.cookie(), session.token(), session.ttl(), "/").toString());
    }

    private static String bindingName(String state) { return "fc_oauth_" + state.substring(0, 16); }

    /** Apple's cross-site POST callback needs SameSite=None. Google's top-level GET works with Lax. */
    private static ResponseCookie bindingCookie(String provider, String state, String value, Duration ttl) {
        return ResponseCookie.from(bindingName(state), value)
                .httpOnly(true)
                .secure(true)
                .sameSite("apple".equals(provider) ? "None" : "Lax")
                .path(SignInProviders.BASE)
                .maxAge(ttl)
                .build();
    }

    private static ResponseEntity.BodyBuilder response(int status) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer");
    }
}