package com.fashioncentre.auth;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("prod")
public class WhatsAppCodeSender implements CodeSender {
    @Override
    public void send(String phoneE164, String code) {
        throw new IllegalStateException("WhatsApp provider is not configured yet.");
    }
}