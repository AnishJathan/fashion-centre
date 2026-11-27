package com.fashioncentre.auth;

import java.util.Collections;
import java.util.List;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class SocialTokenVerifier {
    public record VerifiedIdentity(String provider, String subject, String firstName, String email) {}
    private static final String APPLE_ISSUER = "https://appleid.apple.com";
    private static final int MAX_NAME = 80;

    private final GoogleIdTokenVerifier google;
    private final JwtDecoder apple;

    public SocialTokenVerifier(@Value("${auth.google-client-id}") String googleClientId,
                               @Value("${auth.apple-bundle-id}") String appleBundleId) {
        this.google = new GoogleIdTokenVerifier.Builder(new NetHttpTransport(), GsonFactory.getDefaultInstance())
                .setAudience(Collections.singletonList(googleClientId))
                .build();

        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(APPLE_ISSUER + "/auth/keys").build();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer(APPLE_ISSUER),
                new JwtClaimValidator<List<String>>("aud", aud -> aud != null && aud.contains(appleBundleId))));
        this.apple = decoder;
    }

    public VerifiedIdentity verifyApple(String idToken, String firstName) {
        try {
            Jwt jwt = apple.decode(idToken);
            return new VerifiedIdentity("apple", jwt.getSubject(), cleanName(firstName),
                    jwt.getClaimAsString("email"));
        } catch (Exception e) {
            throw invalid("Apple sign-in could not be verified.");
        }
    }

    // Apple sends the name only on the first sign-in, and the app passes it along.
    private static String cleanName(String name) {
        if (name == null) return "";
        String trimmed = name.strip();
        return trimmed.length() > MAX_NAME ? trimmed.substring(0, MAX_NAME) : trimmed;
    }

    private static ResponseStatusException invalid(String message) {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, message);
    }
}