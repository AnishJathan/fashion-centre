package com.fashioncentre.tryon;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Fail closed: a feature flag is not an authentication, storage or provider adapter. */
@Configuration(proxyBeanMethods = false)
public class TryOnRuntimeConfiguration {
    @Bean
    InitializingBean rejectUnsupportedGenerationActivation(
            @Value("${fashion-centre.try-on.enabled:false}") boolean requested) {
        return () -> {
            if (requested) throw new IllegalStateException(
                    "TRY_ON_RUNTIME_UNAVAILABLE: private-job authentication, storage and provider adapters are not wired.");
        };
    }
}
