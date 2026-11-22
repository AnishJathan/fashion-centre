package com.fashioncentre.auth;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuthIdentityRepository extends JpaRepository<AuthIdentity, Long> {
    Optional<AuthIdentity> findByProviderAndSubject(String provider, String subject);
}