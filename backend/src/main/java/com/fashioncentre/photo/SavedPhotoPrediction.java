package com.fashioncentre.photo;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Associates a client-visible prediction ID with its owner and the provider receipt. */
@Entity
@Table(name = "saved_photo_predictions")
class SavedPhotoPrediction {
    @Id
    @Column(length = 36)
    private String id;

    @Column(nullable = false, length = 36)
    private String userId;

    @Column(nullable = false, length = 128)
    private String providerId;

    protected SavedPhotoPrediction() {
        // Required by JPA.
    }

    SavedPhotoPrediction(String userId, String providerId) {
        this.id = UUID.randomUUID().toString();
        this.userId = userId;
        this.providerId = providerId;
    }

    String id() {
        return id;
    }

    String providerId() {
        return providerId;
    }
}
