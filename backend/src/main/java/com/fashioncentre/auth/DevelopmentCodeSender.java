package com.fashioncentre.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
@Profile("local-auth & !prod")
class DevelopmentCodeSender implements CodeSender {
    private final boolean exposeCode;

    DevelopmentCodeSender(@Value("${auth.expose-dev-code:false}") boolean exposeCode) {
        this.exposeCode = exposeCode;
    }

    @Override
    public void send(String phone, String code) {
        if (!exposeCode) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Local code delivery is disabled.");
        }
        // AuthService returns the code to the local caller. Never log codes or phone numbers.
    }
}
