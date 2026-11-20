package com.fashioncentre.photo;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

interface SavedPhotoPredictionRepository extends JpaRepository<SavedPhotoPrediction, String> {
    Optional<SavedPhotoPrediction> findByIdAndUserId(String id, String userId);
}
