package com.fashioncentre.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("!prod")
public class LogCodeSender implements CodeSender {
    private static final Logger log = LoggerFactory.getLogger(LogCodeSender.class);

    @Override
    public void send(String phoneE164, String code) {
        log.warn("DEV ONLY login code for {}: {}", phoneE164, code);
    }
}