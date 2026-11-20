package com.fashioncentre.auth;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, String> {
    Optional<User> findByPhoneNumber(String phoneNumber);
    Optional<User> findByGoogleSubjectHash(String googleSubjectHash);

    @Modifying
    @Query("UPDATE User u SET u.firstName = :name, u.updatedAt = :now WHERE u.id = :id")
    int updateProfileName(@Param("id") String id, @Param("name") String name, @Param("now") java.time.Instant now);

    // Concurrent first sign-ins for one Google subject must resolve to the same account.
    @Modifying
    @Query(value = """
            INSERT INTO users (id, google_subject_hash, first_name, created_at, updated_at)
            VALUES (:id, :subject, :name, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON DUPLICATE KEY UPDATE google_subject_hash = google_subject_hash
            """, nativeQuery = true)
    void ensureGoogleUser(@Param("id") String id, @Param("subject") String subject, @Param("name") String name);
}
