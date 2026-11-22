package com.fashioncentre.auth;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException; 

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    static final String COOKIE = "fc_session";
    private final AuthService auth;
    private final SocialTokenVerifier verifier;

    public AuthController(AuthService auth, SocialTokenVerifier verifier) {
        this.auth = auth;
        this.verifier = verifier;
    }
    public record PhoneRequest(@NotBlank String phone) {}
    public record VerifyRequest(@NotBlank String phone, @Pattern(regexp = "\\d{6}") String code) {}
    public record SocialRequest(@NotBlank String idToken, String firstName) {}

    @PostMapping("/request-code")
    public Map<String, Object> requestCode(@Valid @RequestBody PhoneRequest req) {
        String devCode = auth.requestCode(req.phone());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("expiresInSeconds", 120);
        body.put("resendInSeconds", 30);
        if (devCode != null) {
            body.put("devCode", devCode); // only when AUTH_EXPOSE_DEV_CODE=true
        }
        return body;
    }
    @Value("${auth.session-days:365}") private long sessionDays;
    @PostMapping("/verify-code")
    public ResponseEntity<Map<String, Object>> verifyCode(@Valid @RequestBody VerifyRequest req) {
        String token = auth.verifyCode(req.phone(), req.code());
        boolean hasPhoto = auth.currentUser(token)
                .map(u -> u.getPhotoPublicId() != null)
                .orElse(false);

        Map<String, Object> body = Map.of("ok", true, "hasPhoto", hasPhoto);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie(token, Duration.ofDays(sessionDays)).toString())
                .body(body);
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@CookieValue(name = COOKIE, required = false) String token) {
        auth.logout(token);
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO).toString())
                .build();
    }

    @PostMapping("/google")
    public ResponseEntity<Map<String, Object>> google(@Valid @RequestBody SocialRequest req) {
        String token = auth.loginWithSocial("google", verifier.verifyGoogle(req.idToken()));
        return startSession(token);
    }

    @PostMapping("/apple")
    public ResponseEntity<Map<String, Object>> apple(@Valid @RequestBody SocialRequest req) {
        String token = auth.loginWithSocial("apple", verifier.verifyApple(req.idToken(), req.firstName()));
        return startSession(token);
    }

    private ResponseEntity<Map<String, Object>> startSession(String token) {
        boolean hasPhoto = auth.currentUser(token)
                .map(u -> u.getPhotoPublicId() != null)
                .orElse(false);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie(token, Duration.ofDays(sessionDays)).toString())
                .body(Map.of("ok", true, "hasPhoto", hasPhoto));
    }

    @GetMapping("/me")
    public Map<String, Object> me(@CookieValue(name = COOKIE, required = false) String token) {
        User user = auth.currentUser(token)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not signed in."));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", user.getId());
        body.put("phone", mask(user.getPhoneNumber()));
        body.put("firstName", user.getFirstName() == null ? "" : user.getFirstName());
        body.put("hasPhoto", user.getPhotoPublicId() != null);
        return body;
    }

    private static ResponseCookie cookie(String value, Duration maxAge) {
        return ResponseCookie.from(COOKIE, value)
                .httpOnly(true)
                .secure(true)
                .sameSite("Lax")
                .path("/")
                .maxAge(maxAge)
                .build();
    }

    private static String mask(String phone) {
        if (phone == null || phone.length() < 6) return "";
        return phone.substring(0, 3) + " •••• " + phone.substring(phone.length() - 3);
    }
}