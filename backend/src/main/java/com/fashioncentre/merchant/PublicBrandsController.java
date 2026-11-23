package com.fashioncentre.merchant;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.Map;
import java.util.Optional;

/**
 * Public, read-only endpoints for customers. They serve only the stored copy
 * of a merchant's catalogue. They never call Shopify and never touch tokens.
 */
@RestController
@RequestMapping("/api/public/brands")
public class PublicBrandsController {

    private final PublicCatalogueService catalogues;

    public PublicBrandsController(PublicCatalogueService catalogues) {
        this.catalogues = catalogues;
    }

    @GetMapping
    public ResponseEntity<?> list() {
        try {
            return ResponseEntity.ok()
                    .cacheControl(CacheControl.maxAge(Duration.ofSeconds(30)))
                    .body(Map.of("brands", catalogues.list()));
        } catch (ShopifyOAuth.Rejected ex) {
            return ResponseEntity.status(503).body(Map.of("code", ex.getMessage()));
        }
    }

    @GetMapping(value = "/{shop}/catalogue", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> catalogue(@PathVariable String shop) {
        try {
            Optional<String> json = catalogues.catalogueJson(shop);

            if (json.isEmpty()) {
                return ResponseEntity.status(404).body(Map.of("code", "BRAND_NOT_FOUND"));
            }

            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_JSON)
                    .cacheControl(CacheControl.maxAge(Duration.ofSeconds(30)))
                    .body(json.get());

        } catch (ShopifyOAuth.Rejected ex) {
            return ResponseEntity.status(503).body(Map.of("code", ex.getMessage()));
        }
    }
}