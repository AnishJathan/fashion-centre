package com.fashioncentre.auth;

import java.time.Instant;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "login_codes")
@Getter @Setter
public class LoginCode {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 20)
    private String phoneNumber;
    @Column(nullable = false, length = 64)
    private String codeHash;
    @Column(nullable = false)
    private Instant expiresAt;
    @Column(nullable = false)
    private Instant createdAt;
    @Column(nullable = false)
    private int attempts = 0;
    @Column(nullable = false)
    private boolean used = false;
}