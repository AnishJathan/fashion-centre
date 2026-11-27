package com.fashioncentre.auth;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import org.springframework.boot.web.server.Cookie;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    public static final String SESSION_COOKIE = "fc_session";
    private final AuthService auth;
//    private final SocialTokenVerifier verifier;

    public AuthController(AuthService auth) { this.auth = auth; }
    public record PhoneRequest(@NotBlank String phone) {}
    public record VerifyRequest(@NotBlank String phone, @NotBlank @Pattern(regexp = "[0-9]{6}") String code) {}
    public record SocialRequest(@NotBlank String idToken, String firstName) {}

    @PostMapping("/request-code")
    public ResponseEntity<Map<String, Object>> requestCode(@Valid @RequestBody PhoneRequest req) {
        String devCode = auth.requestCode(req.phone());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("expiresInSeconds", AuthService.CODE_TTL.toSeconds());
        body.put("resendInSeconds", AuthService.RESEND_WAIT.toSeconds());
        if (devCode != null) {
            body.put("devCode", devCode); // only when AUTH_EXPOSE_DEV_CODE=true
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    @PostMapping("/verify-code")
    public ResponseEntity<Map<String, Object>> verifyCode(@Valid @RequestBody VerifyRequest req) {
        String token = auth.verifyCode(req.phone(), req.code());
        boolean hasPhoto = auth.currentUser(token)
                .map(u -> u.getPhotoPublicId() != null)
                .orElse(false);

        Map<String, Object> body = Map.of("ok", true, "hasPhoto", hasPhoto);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.SET_COOKIE, cookie(token, AuthService.SESSION_TTL).toString())
                .body(body);
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@CookieValue(name = SESSION_COOKIE, required = false) String token) {
        auth.logout(token);
        return ResponseEntity.noContent()
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO).toString())
                .build();
    }

    public record ProfileNameRequest(String accountId, String firstName) {}

    @PostMapping("/me")
    public ResponseEntity<Map<String, String>> updateProfileName(
            @CookieValue(name = SESSION_COOKIE, required = false) String token,
            @RequestBody ProfileNameRequest request) {
        String name = auth.updateProfileName(token, request.accountId(), request.firstName());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("firstName", name));
    }

    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> me(@CookieValue(name = SESSION_COOKIE, required = false) String token) {
        User user = auth.currentUser(token)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not signed in."));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of(
                "id", user.getId(),
                "phone", user.getPhoneNumber() == null ? "" : mask(user.getPhoneNumber()),
                "hasPhoto", user.getPhotoPublicId() != null,
                "firstName", user.getFirstName() == null ? "" : user.getFirstName()));
    }

//
//    @PostMapping("/google")
//    public ResponseEntity<Map<String, Object>> google(@Valid @RequestBody SocialRequest req) {
//        String token = auth.loginWithSocial("google", verifier.verifyGoogle(req.idToken()));
//        return startSession(token);
//    }
//
//    @PostMapping("/apple")
//    public ResponseEntity<Map<String, Object>> apple(@Valid @RequestBody SocialRequest req) {
//        String token = auth.loginWithSocial("apple", verifier.verifyApple(req.idToken(), req.firstName()));
//        return startSession(token);
//    }
    private  ResponseCookie cookie(String value, Duration maxAge) {
        return sessionCookie(SESSION_COOKIE, value, maxAge, "/");
    }

    static ResponseCookie sessionCookie(String name, String value, Duration maxAge, String path) {
        return ResponseCookie.from(name, value)
                .httpOnly(true)
                .secure(true)
                .sameSite("Lax")
                .path(path)
                .maxAge(maxAge)
                .build();
    }

//    static ResponseCookie sessionCookie(String name, String value, Duration maxAge, String path) {
//        return ResponseCookie.from(name, value).httpOnly(true).secure(true)
//                .sameSite(sameSite).path(path).maxAge(maxAge).build();
//    }

    private static String mask(String phone) {
        return phone.substring(0, 3) + " •••• " + phone.substring(phone.length() - 3);
    }

    private ResponseEntity<Map<String, Object>> startSession(String token) {
        boolean hasPhoto = auth.currentUser(token)
                .map(u -> u.getPhotoPublicId() != null)
                .orElse(false);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.SET_COOKIE, cookie(token, AuthService.SESSION_TTL).toString())
                .body(Map.of("ok", true, "hasPhoto", hasPhoto));
    }
}
