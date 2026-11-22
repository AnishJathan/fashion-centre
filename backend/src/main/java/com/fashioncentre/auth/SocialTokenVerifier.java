package com.fashioncentre.auth;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.util.List;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class SocialTokenVerifier {

    public record VerifiedIdentity(String provider, String subject, String email, String firstName) {}

    private final GoogleIdTokenVerifier google;
    private final JwtDecoder apple;

    public SocialTokenVerifier(
            @Value("${auth.google.web-client-id}") String webClientId,
            @Value("${auth.google.ios-client-id}") String iosClientId,
            @Value("${auth.apple.bundle-id}") String bundleId) {
        this.google = new GoogleIdTokenVerifier.Builder(new NetHttpTransport(), GsonFactory.getDefaultInstance())
                .setAudience(List.of(webClientId, iosClientId))
                .build();

        NimbusJwtDecoder decoder = NimbusJwtDecoder
                .withJwkSetUri("https://appleid.apple.com/auth/keys").build();
        OAuth2TokenValidator<Jwt> issuer = JwtValidators.createDefaultWithIssuer("https://appleid.apple.com");
        OAuth2TokenValidator<Jwt> audience = new JwtClaimValidator<List<String>>(
                "aud", aud -> aud != null && aud.contains(bundleId));
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(issuer, audience));
        this.apple = decoder;
    }

    public VerifiedIdentity verifyGoogle(String idToken) {
        GoogleIdToken token;
        try {
            token = google.verify(idToken); // signature, exp, iss, aud
        } catch (GeneralSecurityException e) {
            throw unauthorized();
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Could not verify token.");
        }
        if (token == null) throw unauthorized();

        GoogleIdToken.Payload p = token.getPayload();
        String email = Boolean.TRUE.equals(p.getEmailVerified()) ? p.getEmail() : null;
        return new VerifiedIdentity("google", p.getSubject(), email, (String) p.get("given_name"));
    }

    public VerifiedIdentity verifyApple(String idToken, String firstName) {
        try {
            Jwt jwt = apple.decode(idToken); // signature, exp, iss, aud
            boolean verified = "true".equals(String.valueOf(jwt.getClaim("email_verified")));
            String email = verified ? jwt.getClaimAsString("email") : null;
            return new VerifiedIdentity("apple", jwt.getSubject(), email, firstName);
        } catch (JwtException e) {
            throw unauthorized();
        }
    }

    private static ResponseStatusException unauthorized() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid sign-in token.");
    }
}