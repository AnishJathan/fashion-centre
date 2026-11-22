package com.fashioncentre.auth;

import java.time.Instant;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "users")
@Getter @Setter
public class User {
    @Id
    @Column(length = 36)
    private String id = UUID.randomUUID().toString();

    @Version
    private Long version;

    @Column(unique = true, length = 20)
    private String phoneNumber;
    private String firstName;
    private String lastName;
    private String photoPublicId;
    private Instant photoUpdatedAt;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();
    @Column(nullable = false)
    private Instant updatedAt = Instant.now();
    @Column(unique = true)
    private String googleSub;

    @Column(unique = true)
    private String appleSub;
    @PreUpdate
    void touch() { updatedAt = Instant.now(); }
}