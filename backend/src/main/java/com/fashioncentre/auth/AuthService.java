package com.fashioncentre.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AuthService {
    private static final Pattern E164 = Pattern.compile("^\\+[1-9]\\d{7,14}$");
    private static final Duration CODE_TTL = Duration.ofMinutes(2);
    private static final Duration RESEND_WAIT = Duration.ofSeconds(30);
    private static final int MAX_SENDS_PER_HOUR = 5;
    private static final int MAX_ATTEMPTS = 5;
    private static final Duration SESSION_TTL = Duration.ofDays(30);

    private final SecureRandom random = new SecureRandom();
    private final UserRepository users;
    private final LoginCodeRepository codes;
    private final SessionRepository sessions;
    private final CodeSender sender;
    private final String pepper;
    private final boolean exposeDevCode;

    public AuthService(UserRepository users, LoginCodeRepository codes, SessionRepository sessions,
                       CodeSender sender,
                       @Value("${auth.code-pepper}") String pepper,
                       @Value("${auth.expose-dev-code:false}") boolean exposeDevCode) {
        this.users = users;
        this.codes = codes;
        this.sessions = sessions;
        this.sender = sender;
        this.pepper = pepper;
        this.exposeDevCode = exposeDevCode;
    }

    /** Returns the code only when auth.expose-dev-code is true (local development). Otherwise null. */
    @Transactional
    public String requestCode(String phone) {
        requireE164(phone);
        Instant now = Instant.now();

        codes.findFirstByPhoneNumberOrderByCreatedAtDesc(phone)
                .filter(last -> last.getCreatedAt().plus(RESEND_WAIT).isAfter(now))
                .ifPresent(last -> { throw tooMany("Please wait a moment before requesting another code."); });

        if (codes.countByPhoneNumberAndCreatedAtAfter(phone, now.minus(Duration.ofHours(1))) >= MAX_SENDS_PER_HOUR) {
            throw tooMany("Too many codes requested. Try again later.");
        }

        String code = String.format("%06d", random.nextInt(1_000_000));
        LoginCode lc = new LoginCode();
        lc.setPhoneNumber(phone);
        lc.setCodeHash(codeHash(phone, code));
        lc.setCreatedAt(now);
        lc.setExpiresAt(now.plus(CODE_TTL));
        codes.save(lc);

        // If sending fails, the transaction rolls back and no code is kept
        sender.send(phone, code);

        return exposeDevCode ? code : null;
    }

    // Wrong-code attempts must be saved, so this must not roll back on ResponseStatusException
    @Transactional(noRollbackFor = ResponseStatusException.class)
    public String verifyCode(String phone, String code) {
        requireE164(phone);
        Instant now = Instant.now();

        LoginCode lc = codes.findFirstByPhoneNumberAndUsedFalseOrderByCreatedAtDesc(phone)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.GONE, "This code has expired. Request a new one."));

        if (lc.getExpiresAt().isBefore(now)) {
            throw new ResponseStatusException(HttpStatus.GONE, "This code has expired. Request a new one.");
        }
        if (lc.getAttempts() >= MAX_ATTEMPTS) {
            throw tooMany("Too many attempts. Request a new code.");
        }

        lc.setAttempts(lc.getAttempts() + 1);
        boolean matches = MessageDigest.isEqual(
                codeHash(phone, code).getBytes(StandardCharsets.UTF_8),
                lc.getCodeHash().getBytes(StandardCharsets.UTF_8));
        if (!matches) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "That code is not correct.");
        }
        lc.setUsed(true);

        User user = users.findByPhoneNumber(phone).orElseGet(() -> {
            User u = new User();
            u.setPhoneNumber(phone);
            return users.save(u);
        });

        String token = newToken();
        AuthSession session = new AuthSession();
        session.setUser(user);
        session.setTokenHash(sha256(token));
        session.setCreatedAt(now);
        session.setExpiresAt(now.plus(SESSION_TTL));
        sessions.save(session);
        return token;
    }

    @Transactional(readOnly = true)
    public Optional<User> currentUser(String token) {
        if (token == null || token.isBlank()) return Optional.empty();
        return sessions.findByTokenHashAndExpiresAtAfter(sha256(token), Instant.now())
                .map(AuthSession::getUser);
    }

    @Transactional
    public void logout(String token) {
        if (token != null && !token.isBlank()) {
            sessions.deleteByTokenHash(sha256(token));
        }
    }

    private static void requireE164(String phone) {
        if (phone == null || !E164.matcher(phone).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid phone number.");
        }
    }

    private static ResponseStatusException tooMany(String message) {
        return new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, message);
    }

    private String codeHash(String phone, String code) {
        return sha256(pepper + ":" + phone + ":" + code);
    }

    private String newToken() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String sha256(String input) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}