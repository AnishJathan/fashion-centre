package com.fashioncentre.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
class SignInStore {
    static final Duration FLOW_TTL = Duration.ofMinutes(10);
    static final String MERCHANT_COOKIE = "fc_merchant";
    private static final SecureRandom RANDOM = new SecureRandom();
    private final JdbcTemplate db;
    private final AuthService accounts;

    SignInStore(JdbcTemplate db, AuthService accounts) { this.db = db; this.accounts = accounts; }

    static String token() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    static String challenge(String verifier) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (NoSuchAlgorithmException ex) { throw new IllegalStateException(ex); }
    }

    static boolean validToken(String value) { return value != null && value.matches("[A-Za-z0-9_-]{43}"); }
    static ResponseStatusException invalid() { return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Restart sign-in."); }
    private static Timestamp timestamp(Instant time) { return Timestamp.from(time); }

    @Transactional
    public void begin(String state, String browserKey, String provider, String challenge, String shop) {
        Timestamp now = timestamp(Instant.now());
        db.update("DELETE FROM provider_sign_ins WHERE expires_at <= ?", now);
        db.update("DELETE FROM merchant_sign_in_sessions WHERE expires_at <= ?", now);
        db.update("""
                INSERT INTO provider_sign_ins (state_hash, browser_hash, provider, challenge, shop, expires_at)
                VALUES (?,?,?,?,?,?)
                """, AuthService.sha256(state), AuthService.sha256(browserKey), provider, challenge, shop,
                timestamp(Instant.now().plus(FLOW_TTL)));
    }

    record Flow(String stateHash, String provider, String challenge, String shop) {}

    /** Commit the single-use state before any provider call, including on an ambiguous exchange failure. */
    @Transactional
    public Flow claim(String state, String browserKey, String provider) {
        if (!validToken(state) || !validToken(browserKey)) throw invalid();
        String hash = AuthService.sha256(state);
        int claimed = db.update("""
                UPDATE provider_sign_ins SET browser_hash = NULL
                WHERE state_hash = ? AND provider = ? AND browser_hash = ? AND expires_at > ?
                """, hash, provider, AuthService.sha256(browserKey), timestamp(Instant.now()));
        if (claimed != 1) throw invalid();
        return db.queryForObject("SELECT challenge, shop FROM provider_sign_ins WHERE state_hash = ?",
                (row, i) -> new Flow(hash, provider, row.getString("challenge"), row.getString("shop")), hash);
    }

    String grant(Flow flow, SignInProviders.Identity identity) {
        String grant = token();
        db.update("""
                UPDATE provider_sign_ins SET grant_hash = ?, subject = ?, first_name = ?, identity_expires = ?, expires_at = ?
                WHERE state_hash = ?
                """, AuthService.sha256(grant), identity.subject(), identity.firstName(),
                identity.expires() == null ? null : timestamp(identity.expires()), timestamp(Instant.now().plusSeconds(90)), flow.stateHash());
        return grant;
    }

    record Session(String cookie, String token, Duration ttl) {
        @Override public String toString() { return "Session[redacted]"; }
    }

    @Transactional
    public Session finish(String provider, String grant, String verifier) {
        if (!validToken(grant) || !validToken(verifier)) throw invalid();
        String hash = AuthService.sha256(grant);
        record Authorized(String shop, SignInProviders.Identity identity) {}
        var identity = db.query("""
                SELECT shop, subject, first_name, identity_expires FROM provider_sign_ins
                WHERE grant_hash = ? AND provider = ? AND challenge = ? AND expires_at > ? FOR UPDATE
                """, (row, i) -> {
                    Timestamp expires = row.getTimestamp("identity_expires");
                    return new Authorized(row.getString("shop"), new SignInProviders.Identity(row.getString("subject"),
                            row.getString("first_name"), expires == null ? null : expires.toInstant()));
                }, hash, provider, challenge(verifier), timestamp(Instant.now())).stream().findFirst().orElseThrow(SignInStore::invalid);
        db.update("DELETE FROM provider_sign_ins WHERE grant_hash = ?", hash);
        return session(provider, identity.shop(), identity.identity());
    }

    @Transactional
    public Session session(String provider, String shop, SignInProviders.Identity identity) {
        if ("google".equals(provider)) {
            return new Session(AuthController.SESSION_COOKIE, accounts.googleSession(identity.subject(), identity.firstName()), AuthService.SESSION_TTL);
        }
        Duration ttl = Duration.between(Instant.now(), identity.expires());
        if (ttl.isNegative() || ttl.isZero()) throw invalid();
        String token = token();
        db.update("INSERT INTO merchant_sign_in_sessions (token_hash, shop, shopify_user_id, expires_at) VALUES (?,?,?,?)",
                AuthService.sha256(token), shop, identity.subject(), timestamp(identity.expires()));
        return new Session(MERCHANT_COOKIE, token, ttl);
    }

    Optional<String> merchant(String token) {
        if (!validToken(token)) return Optional.empty();
        return db.query("SELECT shop FROM merchant_sign_in_sessions WHERE token_hash = ? AND expires_at > ?",
                (row, i) -> row.getString("shop"), AuthService.sha256(token), timestamp(Instant.now())).stream().findFirst();
    }

    void logoutMerchant(String token) {
        if (validToken(token)) db.update("DELETE FROM merchant_sign_in_sessions WHERE token_hash = ?", AuthService.sha256(token));
    }
}
