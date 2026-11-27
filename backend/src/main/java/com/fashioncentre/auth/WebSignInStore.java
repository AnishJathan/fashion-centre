package com.fashioncentre.auth;

import java.sql.Timestamp;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Browser-only flow state. Kept apart from native rows, which carry challenges and grants. */
@Service
class WebSignInStore {
    private final JdbcTemplate db;

    WebSignInStore(JdbcTemplate db) { this.db = db; }

    public record Flow(String provider, String shop) {}

    @Transactional
    public void begin(String state, String browserKey, String provider, String shop) {
        Instant now = Instant.now();
        db.update("DELETE FROM web_sign_ins WHERE expires_at <= ?", Timestamp.from(now));
        db.update("INSERT INTO web_sign_ins (state_hash, browser_hash, provider, shop, expires_at) VALUES (?,?,?,?,?)",
                AuthService.sha256(state), AuthService.sha256(browserKey), provider, shop,
                Timestamp.from(now.plus(SignInStore.FLOW_TTL)));
    }

    /** Single use: the browser hash is cleared before any provider call. */
    @Transactional
    public Flow claim(String state, String browserKey, String provider) {
        if (!SignInStore.validToken(state) || !SignInStore.validToken(browserKey)) throw SignInStore.invalid();
        String hash = AuthService.sha256(state);
        int claimed = db.update("""
                UPDATE web_sign_ins SET browser_hash = NULL
                WHERE state_hash = ? AND provider = ? AND browser_hash = ? AND expires_at > ?
                """, hash, provider, AuthService.sha256(browserKey), Timestamp.from(Instant.now()));
        if (claimed != 1) throw SignInStore.invalid();
        return db.queryForObject("SELECT shop FROM web_sign_ins WHERE state_hash = ?",
                (row, i) -> new Flow(provider, row.getString("shop")), hash);
    }
}