# Merchant encrypted persistence

See [the repository persistence guide](../PERSISTENCE.md) for the JDBC implementation, explicit V1 migration, H2-only verification, trusted authentication boundary, durability tests and remaining production work.

Combined main keeps the existing shopper auth and upload configuration. Merchant/private-job schema scripts are under src/main/resources/db/manual and are not Flyway migrations. The /api/try-on/status and /jobs routes describe only the unwired queued private-job pipeline, not the separate existing Pruna endpoints.
