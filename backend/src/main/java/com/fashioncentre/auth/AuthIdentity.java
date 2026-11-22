package com.fashioncentre.auth;

import java.time.Instant;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "auth_identities",
        uniqueConstraints = @UniqueConstraint(columnNames = {"provider", "subject"}))
@Getter @Setter
public class AuthIdentity {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 20)
    private String provider;

    @Column(nullable = false)
    private String subject;

    @Column
    private String email;

    @ManyToOne(optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    protected AuthIdentity() {}

    public AuthIdentity(String provider, String subject, User user, String email) {
        this.provider = provider;
        this.subject = subject;
        this.user = user;
        this.email = email;
    }
}