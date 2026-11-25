package com.fashioncentre.merchant;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Stores a public-safe copy of a merchant's catalogue (no tokens, no secrets)
 * so customers can browse connected brands without any merchant login.
 */
@Service
public class PublicCatalogueService {

    private final DataSource source;
    private final ObjectMapper mapper;

    public PublicCatalogueService(DataSource source, ObjectMapper mapper) {
        this.source = source;
        this.mapper = mapper;

        // LONGTEXT works on MySQL and H2. For PostgreSQL change LONGTEXT to TEXT.
        try (Connection c = source.getConnection();
             var s = c.createStatement()) {
            s.execute(
                "CREATE TABLE IF NOT EXISTS fc_public_catalogue (" +
                "brand_id VARCHAR(255) NOT NULL PRIMARY KEY, " +
                "shop VARCHAR(255) NOT NULL, " +
                "brand_name VARCHAR(255) NOT NULL, " +
                "image VARCHAR(2048), " +
                "product_count INT NOT NULL, " +
                "catalogue_json LONGTEXT NOT NULL, " +
                "updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)"
            );
        } catch (SQLException ex) {
            throw new IllegalStateException("Cannot create fc_public_catalogue", ex);
        }
    }

    public void save(String brandId, String shop, String brandName,
                     ShopifyProductService.Catalogue catalogue) {

        String name = (brandName == null || brandName.isBlank()) ? shop : brandName;
        Map<String, Object> json = toPublic(shop, name, catalogue);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> products = (List<Map<String, Object>>) json.get("products");

        String image = "";
        for (Map<String, Object> p : products) {
            Object img = p.get("image");
            if (img instanceof String s && !s.isBlank()) {
                image = s;
                break;
            }
        }

        String payload;
        try {
            payload = mapper.writeValueAsString(json);
        } catch (JsonProcessingException ex) {
            throw new ShopifyOAuth.Rejected("CATALOGUE_SERIALIZATION_FAILED");
        }

        try (Connection c = source.getConnection()) {

            int updated;
            try (PreparedStatement u = c.prepareStatement(
                    "UPDATE fc_public_catalogue SET shop = ?, brand_name = ?, image = ?, " +
                    "product_count = ?, catalogue_json = ?, updated_at = CURRENT_TIMESTAMP " +
                    "WHERE brand_id = ?")) {
                u.setString(1, shop);
                u.setString(2, name);
                u.setString(3, image);
                u.setInt(4, products.size());
                u.setString(5, payload);
                u.setString(6, brandId);
                updated = u.executeUpdate();
            }

            if (updated == 0) {
                try (PreparedStatement i = c.prepareStatement(
                        "INSERT INTO fc_public_catalogue " +
                        "(brand_id, shop, brand_name, image, product_count, catalogue_json) " +
                        "VALUES (?, ?, ?, ?, ?, ?)")) {
                    i.setString(1, brandId);
                    i.setString(2, shop);
                    i.setString(3, name);
                    i.setString(4, image);
                    i.setInt(5, products.size());
                    i.setString(6, payload);
                    i.executeUpdate();
                }
            }

        } catch (SQLException ex) {
            ex.printStackTrace();
            throw new ShopifyOAuth.Rejected("CATALOGUE_STORAGE_UNAVAILABLE");
        }
    }

    public List<Map<String, Object>> list() {
        List<Map<String, Object>> result = new ArrayList<>();

        try (Connection c = source.getConnection();
             PreparedStatement q = c.prepareStatement(
                 "SELECT shop, brand_name, image, product_count " +
                 "FROM fc_public_catalogue ORDER BY brand_name");
             ResultSet rows = q.executeQuery()) {

            while (rows.next()) {
                Map<String, Object> brand = new LinkedHashMap<>();
                brand.put("key", rows.getString("shop"));
                brand.put("name", rows.getString("brand_name"));
                brand.put("image", rows.getString("image") == null ? "" : rows.getString("image"));
                brand.put("productCount", rows.getInt("product_count"));
                result.add(brand);
            }

        } catch (SQLException ex) {
            ex.printStackTrace();
            throw new ShopifyOAuth.Rejected("CATALOGUE_STORAGE_UNAVAILABLE");
        }

        return result;
    }

    public Optional<String> catalogueJson(String shop) {
        try (Connection c = source.getConnection();
             PreparedStatement q = c.prepareStatement(
                 "SELECT catalogue_json FROM fc_public_catalogue WHERE shop = ?")) {

            q.setString(1, shop);

            try (ResultSet rows = q.executeQuery()) {
                return rows.next() ? Optional.ofNullable(rows.getString(1)) : Optional.empty();
            }

        } catch (SQLException ex) {
            ex.printStackTrace();
            throw new ShopifyOAuth.Rejected("CATALOGUE_STORAGE_UNAVAILABLE");
        }
    }

    /** Builds exactly the JSON shape the frontend parseCatalogue() accepts. */
    private Map<String, Object> toPublic(String shop, String name,
                                         ShopifyProductService.Catalogue catalogue) {

        List<Map<String, Object>> products = new ArrayList<>();

        for (var p : catalogue.products()) {

            if (products.size() >= 48) break;

            if (p.id() == null || p.title() == null || p.title().isBlank() || p.variants() == null) {
                continue;
            }

            List<Map<String, Object>> variants = new ArrayList<>();

            for (var v : p.variants()) {

                String currency = v.currency() != null ? v.currency() : p.currency();

                if (v.id() == null || v.price() == null || currency == null) continue;

                Map<String, String> options = new LinkedHashMap<>();

                if (v.options() != null) {
                    for (var o : v.options()) {
                        if (o.name() != null && !o.name().isBlank()
                                && o.value() != null && !o.value().isBlank()) {
                            options.put(o.name(), o.value());
                        }
                    }
                }

                Map<String, Object> variant = new LinkedHashMap<>();
                variant.put("id", v.id());
                variant.put("key", shop + ":" + v.id());
                variant.put("title", v.title() == null || v.title().isBlank() ? "Default" : v.title());
                variant.put("available", v.available());
                variant.put("amount", v.price());
                variant.put("currency", currency);
                variant.put("options", options);
                variants.add(variant);
            }

            if (variants.isEmpty()) continue;

            String url = "";
            if (p.productUrl() != null && !p.productUrl().isBlank()) {
                url = p.productUrl();
            } else if (p.handle() != null && !p.handle().isBlank()) {
                url = "https://" + shop + "/products/" + p.handle();
            }

            Map<String, Object> product = new LinkedHashMap<>();
            product.put("key", shop + ":" + p.id());
            product.put("title", p.title());
            product.put("category", "General");
            product.put("image", p.imageUrl() == null ? "" : p.imageUrl());
            product.put("url", url);
            product.put("moreVariants", p.moreVariants());
            product.put("variants", variants);

            if (p.description() != null && !p.description().isBlank()) {
                String d = p.description();
                product.put("description", d.length() > 2000 ? d.substring(0, 2000) : d);
            }

            products.add(product);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("shopKey", shop);
        result.put("shopName", name);
        result.put("hasNextPage", false);
        result.put("products", products);
        return result;
    }
}
