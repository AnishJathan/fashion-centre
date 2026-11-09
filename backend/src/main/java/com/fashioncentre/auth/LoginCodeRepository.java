package com.fashioncentre.auth;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LoginCodeRepository extends JpaRepository<LoginCode, Long> {
    Optional<LoginCode> findFirstByPhoneNumberOrderByCreatedAtDesc(String phoneNumber);
    Optional<LoginCode> findFirstByPhoneNumberAndUsedFalseOrderByCreatedAtDesc(String phoneNumber);
    long countByPhoneNumberAndCreatedAtAfter(String phoneNumber, Instant since);
}