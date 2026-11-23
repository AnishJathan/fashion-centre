package com.fashioncentre.merchant;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

public final class EncryptedConnections
        implements ShopifyOAuth.Connections {

    public record Stored(
            String owner,
            String brand,
            String shop,
            Set<String> scopes,
            byte[] nonce,
            byte[] ciphertext
    ) {
        public Stored {
            scopes = Set.copyOf(scopes);
            nonce = nonce.clone();
            ciphertext = ciphertext.clone();
        }

        @Override
        public byte[] nonce() {
            return nonce.clone();
        }

        @Override
        public byte[] ciphertext() {
            return ciphertext.clone();
        }

        @Override
        public String toString() {
            return "StoredConnection[encrypted, redacted]";
        }
    }

    /**
     * Decrypted connection returned only to backend code.
     */
    public record Connection(
            String shop,
            ShopifyOAuth.Grant grant
    ) {}

    /**
     * Repository must enforce active brand membership and ownership.
     */
    public interface Repository {

        void saveExclusive(Stored value);

        default Optional<Stored> read(String brand) {
            return Optional.empty();
        }
    }

    private final SecretKey key;
    private final Repository repository;
    private final SecureRandom random = new SecureRandom();

    public EncryptedConnections(
            SecretKey key,
            Repository repository
    ) {
        this.key = Objects.requireNonNull(key);
        this.repository = Objects.requireNonNull(repository);
    }

    public static byte[] aad(
            String owner,
            String brand,
            String shop,
            Set<String> scopes
    ) {
        StringBuilder value =
                new StringBuilder("fashion-centre-connection-v1:");

        for (String part : List.of(owner, brand, shop)) {
            value.append(part.length())
                    .append(':')
                    .append(part);
        }

        value.append(':')
                .append(scopes.size())
                .append(':');

        for (String scope : new TreeSet<>(scopes)) {
            value.append(scope.length())
                    .append(':')
                    .append(scope);
        }

        return value.toString()
                .getBytes(StandardCharsets.UTF_8);
    }

    /**
     * Serialize the complete Shopify token bundle.
     * This serialized data is encrypted before persistence.
     */
    private byte[] serializeGrant(
            ShopifyOAuth.Grant grant
    ) throws Exception {

        ByteArrayOutputStream byteStream =
                new ByteArrayOutputStream();

        DataOutputStream out =
                new DataOutputStream(byteStream);

        writeString(out, grant.token());
        writeString(out, grant.refreshToken());

        out.writeLong(grant.expiresAt().getEpochSecond());
        out.writeInt(grant.expiresAt().getNano());

        out.writeLong(
                grant.refreshTokenExpiresAt().getEpochSecond()
        );
        out.writeInt(
                grant.refreshTokenExpiresAt().getNano()
        );

        out.writeInt(grant.scopes().size());

        for (String scope : new TreeSet<>(grant.scopes())) {
            writeString(out, scope);
        }

        out.flush();

        return byteStream.toByteArray();
    }

    /**
     * Deserialize the decrypted token bundle.
     */
    private ShopifyOAuth.Grant deserializeGrant(
            byte[] plaintext
    ) throws Exception {

        ByteArrayInputStream byteStream =
                new ByteArrayInputStream(plaintext);

        DataInputStream in =
                new DataInputStream(byteStream);

        String accessToken = readString(in);
        String refreshToken = readString(in);

        Instant expiresAt = Instant.ofEpochSecond(
                in.readLong(),
                in.readInt()
        );

        Instant refreshTokenExpiresAt =
                Instant.ofEpochSecond(
                        in.readLong(),
                        in.readInt()
                );

        int scopeCount = in.readInt();

        if (scopeCount < 0 || scopeCount > 100) {
            throw new IllegalStateException(
                    "INVALID_STORED_SCOPE_COUNT"
            );
        }

        Set<String> scopes = new HashSet<>();

        for (int i = 0; i < scopeCount; i++) {
            scopes.add(readString(in));
        }

        if (in.available() != 0) {
            throw new IllegalStateException(
                    "INVALID_TOKEN_BUNDLE"
            );
        }

        return new ShopifyOAuth.Grant(
                accessToken,
                refreshToken,
                expiresAt,
                refreshTokenExpiresAt,
                scopes
        );
    }

    private static void writeString(
            DataOutputStream out,
            String value
    ) throws Exception {

        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);

        out.writeInt(bytes.length);
        out.write(bytes);
    }

    private static String readString(
            DataInputStream in
    ) throws Exception {

        int length = in.readInt();

        if (length < 0 || length > 1_000_000) {
            throw new IllegalStateException(
                    "INVALID_TOKEN_DATA_LENGTH"
            );
        }

        byte[] bytes = new byte[length];

        in.readFully(bytes);

        return new String(
                bytes,
                StandardCharsets.UTF_8
        );
    }

    /**
     * Encrypt and save the complete Shopify token bundle.
     */
    @Override
    public void save(
            String owner,
            String brand,
            String shop,
            ShopifyOAuth.Grant grant
    ) {

        byte[] plaintext = null;

        try {
            plaintext = serializeGrant(grant);

            byte[] nonce = new byte[12];
            random.nextBytes(nonce);

            Cipher cipher =
                    Cipher.getInstance("AES/GCM/NoPadding");

            cipher.init(
                    Cipher.ENCRYPT_MODE,
                    key,
                    new GCMParameterSpec(128, nonce)
            );

            cipher.updateAAD(
                    aad(owner, brand, shop, grant.scopes())
            );

            byte[] ciphertext =
                    cipher.doFinal(plaintext);

            repository.saveExclusive(
                    new Stored(
                            owner,
                            brand,
                            shop,
                            grant.scopes(),
                            nonce,
                            ciphertext
                    )
            );

        } catch (RuntimeException ex) {
            throw new ShopifyOAuth.Rejected(
                    "CONNECTION_STORAGE_REJECTED"
            );
        } catch (Exception ex) {
            throw new ShopifyOAuth.Rejected(
                    "CONNECTION_STORAGE_UNAVAILABLE"
            );
        } finally {
            if (plaintext != null) {
                Arrays.fill(plaintext, (byte) 0);
            }
        }
    }

    /**
     * Load and decrypt a Shopify connection for an authorized brand.
     */
    public Optional<Connection> load(String brand) {

        Optional<Stored> result = repository.read(brand);

        if (result.isEmpty()) {
            return Optional.empty();
        }

        Stored stored = result.get();
        byte[] plaintext = null;

        try {
            Cipher cipher =
                    Cipher.getInstance("AES/GCM/NoPadding");

            cipher.init(
                    Cipher.DECRYPT_MODE,
                    key,
                    new GCMParameterSpec(128, stored.nonce())
            );

            cipher.updateAAD(
                    aad(
                            stored.owner(),
                            stored.brand(),
                            stored.shop(),
                            stored.scopes()
                    )
            );

            plaintext =
                    cipher.doFinal(stored.ciphertext());

            ShopifyOAuth.Grant grant =
                    deserializeGrant(plaintext);

            return Optional.of(
                    new Connection(
                            stored.shop(),
                            grant
                    )
            );

        } catch (Exception ex) {
            throw new ShopifyOAuth.Rejected(
                    "CONNECTION_DECRYPTION_FAILED"
            );
        } finally {
            if (plaintext != null) {
                Arrays.fill(plaintext, (byte) 0);
            }
        }
    }

    /**
     * Loads a connection and automatically refreshes its access token
     * when it is close to expiration.
     */
    public Connection loadValid(
            String brand,
            ShopifyTokenRefresh tokenRefresh
    ) {

        Stored stored = repository.read(brand)
                .orElseThrow(() ->
                        new ShopifyOAuth.Rejected(
                                "SHOPIFY_NOT_CONNECTED"
                        )
                );

        Connection connection = load(brand)
                .orElseThrow(() ->
                        new ShopifyOAuth.Rejected(
                                "SHOPIFY_NOT_CONNECTED"
                        )
                );

        ShopifyOAuth.Grant grant = connection.grant();

        // Refresh 2 minutes before expiry.
        if (grant.expiresAt() != null
                && grant.expiresAt().isAfter(
                        Instant.now().plusSeconds(120)
                )) {

            return connection;
        }

        // Refresh token itself must still be valid.
        if (grant.refreshTokenExpiresAt() == null
                || !grant.refreshTokenExpiresAt().isAfter(
                        Instant.now()
                )) {

            throw new ShopifyOAuth.Rejected(
                    "SHOPIFY_REAUTHORIZATION_REQUIRED"
            );
        }

        ShopifyOAuth.Grant refreshed =
                tokenRefresh.refresh(
                        connection.shop(),
                        grant
                );

        // Persist the rotated access + refresh tokens encrypted.
        save(
                stored.owner(),
                stored.brand(),
                stored.shop(),
                refreshed
        );

        return new Connection(
                connection.shop(),
                refreshed
        );
    }
}