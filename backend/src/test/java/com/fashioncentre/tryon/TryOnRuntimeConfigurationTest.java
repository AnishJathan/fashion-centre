package com.fashioncentre.tryon;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class TryOnRuntimeConfigurationTest {
    private final ApplicationContextRunner context = new ApplicationContextRunner()
            .withUserConfiguration(TryOnRuntimeConfiguration.class);

    @Test void absentConfigurationAndExplicitFalseRemainDisabled() {
        context.run(result -> assertThat(result).hasNotFailed());
        context.withPropertyValues("fashion-centre.try-on.enabled=false")
                .run(result -> assertThat(result).hasNotFailed());
    }

    @Test void flagAloneCannotActivateMissingProductionAdapters() {
        context.withPropertyValues("fashion-centre.try-on.enabled=true").run(result -> {
            assertThat(result).hasFailed();
            assertThat(result.getStartupFailure()).hasRootCauseMessage(
                    "TRY_ON_RUNTIME_UNAVAILABLE: verified authentication, private object storage and production provider wiring are not installed.");
        });
    }

    @Test void statusAndSubmissionStayPrivateAndDoNotParsePhotos() throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(new TryOnController()).build();
        mvc.perform(get("/api/try-on/status"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.enabled").value(false))
                .andExpect(jsonPath("$.configuredAdapters").isEmpty())
                .andExpect(jsonPath("$.results").isEmpty());
        mvc.perform(post("/api/try-on/jobs").header("X-Owner-Id", "forged")
                        .contentType("application/json").content("not a photo or valid JSON"))
                .andExpect(status().isNotImplemented())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.code").value("TRY_ON_DISABLED"));
    }
}
