package com.fashioncentre.auth;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
@Profile("prod | !local-auth")
class UnavailableCodeSender implements CodeSender {
    @Override
    public void send(String phone, String code) {
        throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "WhatsApp delivery is not configured.");
    }
}
