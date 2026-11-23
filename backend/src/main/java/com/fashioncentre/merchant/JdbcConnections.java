package com.fashioncentre.merchant;

import java.sql.*;
import java.time.*;
import java.util.*;
import java.util.function.Supplier;
import javax.sql.DataSource;

/**
 * Concrete encrypted persistence, deliberately not a Spring bean.
 * The caller must supply a trusted server authentication context, never browser
 * owner IDs/headers.
 * No migration, identity provisioning, database configuration or encryption key
 * setup happens here.
 * SQL and transaction behavior are verified against H2 only.
 */
public final class JdbcConnections implements EncryptedConnections.Repository, ShopifyOAuth.Ownership {
    public record Actor(String ownerId, Instant expiresAt) {
    }

    public record Brand(String id, String name) {
    }

    private final DataSource source;
    private final Supplier<Optional<Actor>> trustedAuthentication;
    private final Clock clock;

    public JdbcConnections(DataSource source, Supplier<Optional<Actor>> trustedAuthentication, Clock clock) {
        this.source = Objects.requireNonNull(source);
        this.trustedAuthentication = Objects.requireNonNull(trustedAuthentication);
        this.clock = Objects.requireNonNull(clock);
        try (var connection = source.getConnection()) {
            schema(connection);
        } catch (SQLException ex) {
            throw rejected("CONNECTION_SCHEMA_UNAVAILABLE");
        }
    }

    private static ShopifyOAuth.Rejected rejected(String code) {
        return new ShopifyOAuth.Rejected(code);
    }

    private static boolean identifier(String text) {
        return text != null && !text.isBlank() && text.length() <= 256
                && text.chars().noneMatch(Character::isISOControl);
    }

    private Actor actor() {
        try {
            var value = trustedAuthentication.get();
            if (value == null || value.isEmpty())
                throw rejected("MERCHANT_SIGN_IN_REQUIRED");
            var actor = value.get();
            if (!identifier(actor.ownerId()) || actor.expiresAt() == null
                    || !actor.expiresAt().isAfter(clock.instant()))
                throw rejected("MERCHANT_SIGN_IN_REQUIRED");
            return actor;
        } catch (RuntimeException ex) {
            throw rejected("MERCHANT_SIGN_IN_REQUIRED");
        }
    }

    private static PreparedStatement statement(Connection connection, String sql) throws SQLException {
        var statement = connection.prepareStatement(sql);
        statement.setQueryTimeout(5);
        return statement;
    }

    private static void schema(Connection connection) throws SQLException {
        try (var query = statement(
                connection,
                "SELECT singleton, version FROM fc_schema_version"); var rows = query.executeQuery()) {

            if (!rows.next()
                    || rows.getInt(1) != 1
                    || (rows.getInt(2) != 1 && rows.getInt(2) != 2)
                    || rows.next()) {
                throw rejected("CONNECTION_SCHEMA_UNSUPPORTED");
            }
        }
    }

    @FunctionalInterface
    private interface Operation<T> {
        T run(Connection connection, Actor actor) throws SQLException;
    }

    private <T> T transaction(String brand, String claimedOwner, Operation<T> operation) {

        if (!identifier(brand))
            throw rejected("BRAND_ACCESS_DENIED");

        Actor initial = actor();

        if (claimedOwner != null && !initial.ownerId().equals(claimedOwner))
            throw rejected("BRAND_ACCESS_DENIED");

        try (var connection = source.getConnection()) {

            connection.setTransactionIsolation(Connection.TRANSACTION_READ_COMMITTED);
            connection.setAutoCommit(false);

            try {
                schema(connection);

                try (var query = statement(
                        connection,
                        "SELECT owner_id, active FROM fc_brand_membership WHERE brand_id = ? FOR UPDATE")) {

                    query.setString(1, brand);

                    try (var rows = query.executeQuery()) {
                        if (!rows.next()
                                || !rows.getBoolean(2)
                                || !initial.ownerId().equals(rows.getString(1))) {
                            throw rejected("BRAND_ACCESS_DENIED");
                        }
                    }
                }

                Actor current = actor();

                if (!initial.ownerId().equals(current.ownerId()))
                    throw rejected("BRAND_ACCESS_DENIED");

                T value = operation.run(connection, current);

                if (!initial.ownerId().equals(actor().ownerId()))
                    throw rejected("BRAND_ACCESS_DENIED");

                connection.commit();
                return value;

            } catch (SQLException | RuntimeException ex) {
                try {
                    connection.rollback();
                } catch (SQLException ignored) {
                }
                throw ex;
            }

        } catch (ShopifyOAuth.Rejected ex) {
            throw ex;

        } catch (SQLException ex) {
            ex.printStackTrace();
            throw rejected("CONNECTION_STORAGE_UNAVAILABLE");
        }
    }

    private static String encodedScopes(Set<String> scopes) {
        if (scopes == null || scopes.isEmpty() || scopes.size() > 64
                || scopes.stream().anyMatch(s -> s == null || s.length() > 128 || !s.matches("[a-z_]+")))
            throw rejected("INVALID_STORED_CONNECTION");
        String encoded = String.join("\n", new TreeSet<>(scopes));
        if (encoded.length() > 4096)
            throw rejected("INVALID_STORED_CONNECTION");
        return encoded;
    }

    private static Set<String> decodedScopes(String text) {
        if (text == null || text.length() > 4096)
            throw rejected("INVALID_STORED_CONNECTION");
        Set<String> result = new HashSet<>(Arrays.asList(text.split("\n", -1)));
        if (!encodedScopes(result).equals(text))
            throw rejected("INVALID_STORED_CONNECTION");
        return Set.copyOf(result);
    }

    private static void validate(EncryptedConnections.Stored value) {
        if (value == null || !identifier(value.owner()) || !identifier(value.brand()) || value.shop() == null
                || !value.shop().equals(ShopifyOAuth.canonicalShop(value.shop())) || value.nonce().length != 12
                || value.ciphertext().length < 17 || value.ciphertext().length > 65536)
            throw rejected("INVALID_STORED_CONNECTION");
        encodedScopes(value.scopes());
    }

   @Override
    public void saveExclusive(EncryptedConnections.Stored value) {
        validate(value);

        try (var connection = source.getConnection()) {

            connection.setTransactionIsolation(Connection.TRANSACTION_READ_COMMITTED);
            connection.setAutoCommit(false);

            try {
                schema(connection);

                // Verify callback owner against active brand membership.
                try (var query = statement(
                        connection,
                        "SELECT owner_id, active FROM fc_brand_membership " +
                        "WHERE brand_id = ? FOR UPDATE")) {

                    query.setString(1, value.brand());

                    try (var rows = query.executeQuery()) {
                        if (!rows.next()
                                || !rows.getBoolean("active")
                                || !value.owner().equals(rows.getString("owner_id"))) {
                            throw rejected("BRAND_ACCESS_DENIED");
                        }
                    }
                }

                // Update existing connection if present.
                int updated;

                try (var update = statement(
                        connection,
                        "UPDATE fc_merchant_connection " +
                        "SET shop = ?, scopes = ?, aad_version = 1, nonce = ?, ciphertext = ? " +
                        "WHERE brand_id = ? AND owner_id = ?")) {

                    update.setString(1, value.shop());
                    update.setString(2, encodedScopes(value.scopes()));
                    update.setBytes(3, value.nonce());
                    update.setBytes(4, value.ciphertext());
                    update.setString(5, value.brand());
                    update.setString(6, value.owner());

                    updated = update.executeUpdate();
                }

                // Insert if no connection exists.
                if (updated == 0) {
                    try (var insert = statement(
                            connection,
                            "INSERT INTO fc_merchant_connection " +
                            "(brand_id, owner_id, shop, scopes, aad_version, nonce, ciphertext) " +
                            "VALUES (?, ?, ?, ?, 1, ?, ?)")) {

                        insert.setString(1, value.brand());
                        insert.setString(2, value.owner());
                        insert.setString(3, value.shop());
                        insert.setString(4, encodedScopes(value.scopes()));
                        insert.setBytes(5, value.nonce());
                        insert.setBytes(6, value.ciphertext());

                        insert.executeUpdate();
                    }
                }

                connection.commit();

            } catch (SQLException | RuntimeException ex) {
                try {
                    connection.rollback();
                } catch (SQLException ignored) {
                }

                throw ex;
            }

        } catch (ShopifyOAuth.Rejected ex) {
            throw ex;

        } catch (SQLException ex) {
            throw rejected("CONNECTION_STORAGE_UNAVAILABLE");
        }
    }

    /**
     * Encrypted data only. Its AAD includes the returned tenant identity and
     * scopes.
     */
    public Optional<EncryptedConnections.Stored> read(String brand) {
        return transaction(brand, null, (connection, actor) -> {
            try (var query = statement(connection,
                    "SELECT owner_id,shop,scopes,aad_version,nonce,ciphertext FROM fc_merchant_connection WHERE brand_id = ?")) {
                query.setString(1, brand);
                try (var rows = query.executeQuery()) {
                    if (!rows.next())
                        return Optional.empty();
                    if (!actor.ownerId().equals(rows.getString(1)) || rows.getInt(4) != 1)
                        throw rejected("INVALID_STORED_CONNECTION");
                    byte[] nonce = rows.getBytes(5), ciphertext = rows.getBytes(6);
                    if (nonce == null || ciphertext == null)
                        throw rejected("INVALID_STORED_CONNECTION");
                    var value = new EncryptedConnections.Stored(rows.getString(1), brand, rows.getString(2),
                            decodedScopes(rows.getString(3)), nonce, ciphertext);
                    validate(value);
                    return Optional.of(value);
                }
            }
        });
    }

    /**
     * Owner self-revocation; no reassignment or reactivation endpoint is provided.
     */
    public void revokeMembership(String brand) {
        transaction(brand, null, (connection, actor) -> {
            try (var delete = statement(connection, "DELETE FROM fc_merchant_connection WHERE brand_id = ?")) {
                delete.setString(1, brand);
                delete.executeUpdate();
            }
            try (var update = statement(connection,
                    "UPDATE fc_brand_membership SET active = FALSE WHERE brand_id = ? AND owner_id = ?")) {
                update.setString(1, brand);
                update.setString(2, actor.ownerId());
                if (update.executeUpdate() != 1)
                    throw rejected("BRAND_ACCESS_DENIED");
            }
            return null;
        });
    }

    @Override
    public boolean ownsBrand(String owner, String brand) {
        if (!identifier(owner) || !identifier(brand)) {
            return false;
        }

        Actor current = actor();

        if (!current.ownerId().equals(owner)) {
            return false;
        }

        try (var connection = source.getConnection()) {
            schema(connection);

            try (var query = statement(connection,
                    "SELECT 1 FROM fc_brand_membership " +
                            "WHERE brand_id = ? AND owner_id = ? AND active = TRUE")) {

                query.setString(1, brand);
                query.setString(2, current.ownerId());

                try (var rows = query.executeQuery()) {
                    return rows.next();
                }
            }

        } catch (ShopifyOAuth.Rejected ex) {
            throw ex;
        } catch (SQLException ex) {
            throw rejected("CONNECTION_STORAGE_UNAVAILABLE");
        }
    }

    @Override
    public boolean ownsBrandFromCallback(String owner, String brand) {
        if (!identifier(owner) || !identifier(brand)) {
            return false;
        }

        try (var connection = source.getConnection()) {
            schema(connection);

            try (var query = statement(
                    connection,
                    "SELECT 1 FROM fc_brand_membership " +
                    "WHERE brand_id = ? " +
                    "AND owner_id = ? " +
                    "AND active = TRUE"
            )) {

                query.setString(1, brand);
                query.setString(2, owner);

                try (var rows = query.executeQuery()) {
                    return rows.next();
                }
            }

        } catch (ShopifyOAuth.Rejected ex) {
            throw ex;
        } catch (SQLException ex) {
            throw rejected("CONNECTION_STORAGE_UNAVAILABLE");
        }
    }

    public Brand registerBrand(String name) {
        if (name == null) {
            throw rejected("INVALID_BRAND_NAME");
        }

        String cleanName = name.trim();

        if (cleanName.isBlank()
                || cleanName.length() > 120
                || cleanName.chars().anyMatch(Character::isISOControl)) {
            throw rejected("INVALID_BRAND_NAME");
        }

        Actor initial = actor();
        String brandId = UUID.randomUUID().toString();

        try (var connection = source.getConnection()) {
            connection.setTransactionIsolation(Connection.TRANSACTION_READ_COMMITTED);
            connection.setAutoCommit(false);

            try {
                schema(connection);

                Actor current = actor();
                if (!initial.ownerId().equals(current.ownerId())) {
                    throw rejected("BRAND_ACCESS_DENIED");
                }

                try (var insert = statement(connection,
                        "INSERT INTO fc_brand (id, name) VALUES (?, ?)")) {
                    insert.setString(1, brandId);
                    insert.setString(2, cleanName);
                    insert.executeUpdate();
                }

                try (var insert = statement(connection,
                        "INSERT INTO fc_brand_membership " +
                                "(brand_id, owner_id, active, created_at, updated_at) " +
                                "VALUES (?, ?, TRUE, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6))")) {
                    insert.setString(1, brandId);
                    insert.setString(2, current.ownerId());
                    insert.executeUpdate();
                }

                if (!initial.ownerId().equals(actor().ownerId())) {
                    throw rejected("BRAND_ACCESS_DENIED");
                }

                connection.commit();
                return new Brand(brandId, cleanName);

            } catch (SQLException | RuntimeException ex) {
                try {
                    connection.rollback();
                } catch (SQLException ignored) {
                }
                throw ex;
            }

        } catch (ShopifyOAuth.Rejected ex) {
            throw ex;
        } catch (SQLException ex) {
            ex.printStackTrace(); // TEMPORARY: show actual SQL error
            throw rejected("CONNECTION_STORAGE_UNAVAILABLE");
        }
    }
    public Brand resolveBrandForCurrentActor() {

            Actor initial = actor();

            try (var connection = source.getConnection();
                    var query = statement(
                            connection,
                            "SELECT b.id, b.name, " +
                            "CASE WHEN c.brand_id IS NOT NULL THEN 1 ELSE 0 END AS connected " +
                            "FROM fc_brand_membership m " +
                            "JOIN fc_brand b ON b.id = m.brand_id " +
                            "LEFT JOIN fc_merchant_connection c " +
                            "ON c.brand_id = m.brand_id " +
                            "AND c.owner_id = m.owner_id " +
                            "WHERE m.owner_id = ? AND m.active = TRUE")) {

                query.setString(1, initial.ownerId());

                try (var rows = query.executeQuery()) {

                    List<Brand> brands = new ArrayList<>();
                    List<Brand> connectedBrands = new ArrayList<>();

                    while (rows.next()) {

                        Brand brand = new Brand(
                                rows.getString("id"),
                                rows.getString("name")
                        );

                        brands.add(brand);

                        if (rows.getBoolean("connected")) {
                            connectedBrands.add(brand);
                        }
                    }

                    Actor current = actor();

                    if (!initial.ownerId().equals(current.ownerId())) {
                        throw rejected("BRAND_ACCESS_DENIED");
                    }

                    if (brands.isEmpty()) {
                        throw rejected("MERCHANT_BRAND_NOT_FOUND");
                    }

                    // Prefer the brand with an existing Shopify connection.
                    if (connectedBrands.size() == 1) {
                        return connectedBrands.get(0);
                    }

                    // Multiple existing Shopify connections are ambiguous.
                    if (connectedBrands.size() > 1) {
                        throw rejected("MERCHANT_MULTIPLE_BRANDS");
                    }

                    // If no brand is connected, use the brand only when unique.
                    if (brands.size() == 1) {
                        return brands.get(0);
                    }

                    throw rejected("MERCHANT_MULTIPLE_BRANDS");
                }

            } catch (ShopifyOAuth.Rejected ex) {
                throw ex;

            } catch (SQLException ex) {
                throw rejected("CONNECTION_STORAGE_UNAVAILABLE");
            }
        }
}
