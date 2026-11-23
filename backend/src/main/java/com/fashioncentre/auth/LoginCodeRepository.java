package com.fashioncentre.auth;

import java.time.Instant;
import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

public interface LoginCodeRepository extends JpaRepository<LoginCode, Long> {
    Optional<LoginCode> findFirstByPhoneNumberOrderByCreatedAtDesc(String phoneNumber);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<LoginCode> findTopByPhoneNumberOrderByCreatedAtDescIdDesc(String phoneNumber);
    long countByPhoneNumberAndCreatedAtAfter(String phoneNumber, Instant since);
}
