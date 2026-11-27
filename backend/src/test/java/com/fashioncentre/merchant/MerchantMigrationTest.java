package com.fashioncentre.merchant;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.InputStream;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class MerchantMigrationTest {

    @Test
    void publishedAuthMigrationsKeepTheirOriginalVersionsAndContents() throws Exception {
        var expected = Map.of(
                "V1__auth_tables.sql", "fe5cd22de597efdefc9295aa5b10f06626ed1b171c390521bdd4254856cb5328",
                "V2__saved_photo_predictions.sql", "6d40103e466b55384710e8de6807ea24c0cd2ac8f1eb8da655326c95b39036c1",
                "V3__provider_sign_in.sql", "a8bb94f6d91602f95c31f89b15414e07656b90ed6790fa12e6f7eef908838587");
        for (var migration : expected.entrySet()) {
            try (InputStream file = getClass().getResourceAsStream("/db/migration/" + migration.getKey())) {
                assertThat(file).as(migration.getKey()).isNotNull();
                byte[] checksum = MessageDigest.getInstance("SHA-256").digest(file.readAllBytes());
                assertThat(HexFormat.of().formatHex(checksum)).as(migration.getKey()).isEqualTo(migration.getValue());
            }
        }
    }

    @Test
    @EnabledIfEnvironmentVariable(named = "FASHION_TEST_MYSQL_URL", matches = ".+")
    void upgradesLegacyAccountsOnMySqlAndAllowsMerchantRegistration() {
        String url = System.getenv("FASHION_TEST_MYSQL_URL");
        assertThat(url).matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/fashion_migration_test(?:\\?.*)?");
        var source = new DriverManagerDataSource(url, System.getenv("FASHION_TEST_MYSQL_USER"),
                System.getenv("FASHION_TEST_MYSQL_PASSWORD"));
        var jdbc = new JdbcTemplate(source);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()", Integer.class))
                .as("an empty disposable database is required").isZero();

        Flyway.configure().dataSource(source).target("3").load().migrate();
        String owner = "legacy-google-owner";
        jdbc.update("INSERT INTO users(id, google_subject_hash, photo_public_id, created_at, updated_at) "
                + "VALUES (?, ?, ?, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6))",
                owner, "fixture-subject-hash", "fixture-saved-photo");
        jdbc.update("INSERT INTO saved_photo_predictions(id, user_id, provider_id) VALUES (?, ?, ?)",
                "legacy-prediction", owner, "fixture-provider-job");

        var flyway = Flyway.configure().dataSource(source).load();
        flyway.migrate();
        flyway.validate();
        assertThat(jdbc.queryForObject("SELECT photo_public_id FROM users WHERE google_subject_hash = ?",
                String.class, "fixture-subject-hash")).isEqualTo("fixture-saved-photo");
        assertThat(jdbc.queryForObject("SELECT user_id FROM saved_photo_predictions WHERE id = ?",
                String.class, "legacy-prediction")).isEqualTo(owner);

        var connections = new JdbcConnections(source,
                () -> Optional.of(new JdbcConnections.Actor(owner, Instant.now().plusSeconds(600))),
                Clock.systemUTC());
        var brand = connections.registerBrand("Fixture store");
        assertThat(connections.resolveBrandForCurrentActor()).isEqualTo(brand);
    }
}
