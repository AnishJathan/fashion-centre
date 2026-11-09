package com.fashioncentre.auth;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
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

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    public record PhoneRequest(@NotBlank String phone) {}
    public record VerifyRequest(@NotBlank String phone, @Pattern(regexp = "\\d{6}") String code) {}

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

    @PostMapping("/verify-code")
    public ResponseEntity<Map<String, Object>> verifyCode(@Valid @RequestBody VerifyRequest req) {
        String token = auth.verifyCode(req.phone(), req.code());
        boolean hasPhoto = auth.currentUser(token)
                .map(u -> u.getPhotoPublicId() != null)
                .orElse(false);

        Map<String, Object> body = Map.of("ok", true, "hasPhoto", hasPhoto);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie(token, Duration.ofDays(30)).toString())
                .body(body);
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@CookieValue(name = COOKIE, required = false) String token) {
        auth.logout(token);
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO).toString())
                .build();
    }

    @GetMapping("/me")
    public Map<String, String> me(@CookieValue(name = COOKIE, required = false) String token) {
        User user = auth.currentUser(token)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not signed in."));
        return Map.of(
                "id", user.getId(),
                "phone", mask(user.getPhoneNumber()),
                "firstName", user.getFirstName() == null ? "" : user.getFirstName());
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
        return phone.substring(0, 3) + " •••• " + phone.substring(phone.length() - 3);
    }
}