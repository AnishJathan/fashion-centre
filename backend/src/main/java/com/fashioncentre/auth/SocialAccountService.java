package com.fashioncentre.auth;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SocialAccountService {

    private final AuthIdentityRepository identities;
    private final UserRepository users;

    public SocialAccountService(AuthIdentityRepository identities, UserRepository users) {
        this.identities = identities;
        this.users = users;
    }

    @Transactional
    public User findOrCreate(String provider, SocialTokenVerifier.VerifiedIdentity id) {
        return identities.findByProviderAndSubject(provider, id.subject())
                .map(AuthIdentity::getUser)
                .orElseGet(() -> {
                    User user = new User();
                    user.setFirstName(id.firstName());
                    users.save(user);
                    identities.save(new AuthIdentity(provider, id.subject(), user, id.email()));
                    return user;
                });
    }
}