package com.fashioncentre.auth;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.time.Duration;
import java.util.Arrays;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;

/** Browser sign-in only. Native apps use SignInController, which is unchanged. */
@RestController
@RequestMapping(WebSignInController.PATH)
class WebSignInController {
    static final String PATH = "/api/auth/web/sign-in";
    static final String BASE = PATH + "/";

    private final SignInProviders providers;
    private final SignInStore sessions;
    private final WebSignInStore store;
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(WebSignInController.class);

    WebSignInController(SignInProviders providers, SignInStore sessions, WebSignInStore store) {
        this.providers = providers;
        this.sessions = sessions;
        this.store = store;
    }

    @GetMapping("/{provider}/browser")
    ResponseEntity<Void> browser(@PathVariable String provider, @RequestParam(required = false) String shop) {
        providers.origin(provider);
        String domain = "shopify".equals(provider) ? SignInProviders.shop(shop) : null;
        String state = SignInStore.token(), key = SignInStore.token();
        store.begin(state, key, provider, domain);
        return response(303)
                .location(providers.authorization(provider, domain, state, key, BASE))
                .header(HttpHeaders.SET_COOKIE, bindingCookie(provider, state, key, SignInStore.FLOW_TTL).toString())
                .build();
    }

    // Apple returns with response_mode=form_post, a cross-site POST, so this route accepts both methods.
    @RequestMapping(value = "/{provider}/callback", method = {RequestMethod.GET, RequestMethod.POST})
    ResponseEntity<Void> callback(@PathVariable String provider,
                                  @RequestParam MultiValueMap<String, String> params,
                                  HttpServletRequest request) {
        String origin = providers.origin(provider);
        if (params.size() > 20 || params.values().stream().anyMatch(v -> v.size() != 1 || v.get(0).length() > 4096))
            throw SignInStore.invalid();
        String state = params.getFirst("state");
        if (!SignInStore.validToken(state)) throw SignInStore.invalid();
        String name = cookieName(state);
        String key = request.getCookies() == null ? null : Arrays.stream(request.getCookies())
                .filter(c -> name.equals(c.getName())).map(Cookie::getValue).findFirst().orElse(null);
        WebSignInStore.Flow flow = store.claim(state, key, provider);

        var redirect = response(303)
                .header(HttpHeaders.SET_COOKIE, bindingCookie(provider, state, "", Duration.ZERO).toString());
        String result = "cancelled";
        if (!params.containsKey("error")) {
            SignInProviders.Identity identity = null;
            try {
                identity = providers.exchange(provider, flow.shop(), params.toSingleValueMap(), key, BASE);
                // inside callback():
            } catch (RuntimeException providerFailure) {
                log.warn("Google sign-in exchange failed", providerFailure);
                result = "failed";
            }
            if (identity != null) {
                SignInStore.Session session = sessions.session(provider, flow.shop(), identity);
                redirect.header(HttpHeaders.SET_COOKIE,
                        AuthController.sessionCookie(session.cookie(), session.token(), session.ttl(), "/").toString());
                result = "success";
            }
        }
        String webRoute = "shopify".equals(provider) ? "#/owner" : "#/login";
        return redirect.location(URI.create(origin + "/?signin=" + result + webRoute)).build();
    }

    private static String cookieName(String state) { return "fc_web_oauth_" + state.substring(0, 16); }

    /** Apple's cross-site POST needs SameSite=None. Google's top-level GET works with Lax. */
    private static ResponseCookie bindingCookie(String provider, String state, String value, Duration ttl) {
        return ResponseCookie.from(cookieName(state), value)
                .httpOnly(true)
                .secure(true)
                .sameSite("apple".equals(provider) ? "None" : "Lax")
                .path(PATH)
                .maxAge(ttl)
                .build();
    }

    private static ResponseEntity.BodyBuilder response(int status) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer");
    }
}