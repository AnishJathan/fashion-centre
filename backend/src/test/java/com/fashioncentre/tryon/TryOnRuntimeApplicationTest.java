package com.fashioncentre.tryon;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.multipart.MultipartResolver;
import software.amazon.awssdk.services.s3.S3Client;
import com.fashioncentre.PrunaService;
import com.fashioncentre.auth.AuthService;
import com.fashioncentre.tryon.jobs.PrivateJobWorker;
import javax.sql.DataSource;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// Isolated in-memory auth schema. No production datasource, credentials or provider calls.
@SpringBootTest(properties={
    "spring.datasource.url=jdbc:h2:mem:combined-runtime;DB_CLOSE_DELAY=-1",
    "spring.datasource.driver-class-name=org.h2.Driver",
    "spring.datasource.username=sa", "spring.datasource.password=",
    "spring.jpa.hibernate.ddl-auto=create-drop", "spring.flyway.enabled=false",
    "auth.code-pepper=test-only-not-a-secret", "r2.bucket=test-only"
})
@AutoConfigureMockMvc
class TryOnRuntimeApplicationTest {
    @Autowired ApplicationContext application;
    @Autowired MockMvc mvc;
    @MockitoBean S3Client s3;
    @MockitoBean PrunaService pruna;

    @Test void combinedApplicationRetainsAuthAndUploadsWhileMerchantJobsStayGated() throws Exception {
        assertThat(application.getBeansOfType(MultipartResolver.class)).isNotEmpty();
        assertThat(application.getBeansOfType(DataSource.class)).hasSize(1);
        assertThat(application.getBeansOfType(AuthService.class)).hasSize(1);
        assertThat(application.getBeansOfType(PrivateJobWorker.class)).isEmpty();
        mvc.perform(get("/api/try-on/status"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.enabled").value(false))
                .andExpect(jsonPath("$.configuredAdapters").isEmpty());
        mvc.perform(post("/api/try-on/jobs").header("X-Owner-Id", "forged")
                        .contentType("image/png").content(new byte[]{0,1,2,3}))
                .andExpect(status().isNotImplemented()).andExpect(jsonPath("$.code").value("TRY_ON_DISABLED"));
        mvc.perform(get("/api/merchant/shopify/readiness"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.ready").value(false));
    }

    @Test void realShopperEndpointsRemainMappedAndAnonymousUploadsAreRejected() throws Exception {
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
        mvc.perform(multipart("/api/try-on/me").file("garment", new byte[]{1,2,3}))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/try-on").contentType("application/json").content("{}"))
                .andExpect(status().isBadRequest());
        org.mockito.Mockito.verifyNoInteractions(s3, pruna);
    }
    @Test void manualSchemasCannotBeDiscoveredByFlywayDefaultLocation() {
        assertThat(getClass().getResource("/db/migration/V1__auth_tables.sql")).isNotNull();
        assertThat(getClass().getResource("/db/migration/V1__merchant_connections.sql")).isNull();
        assertThat(getClass().getResource("/db/migration/V2__private_jobs.sql")).isNull();
        assertThat(getClass().getResource("/db/manual/V1__merchant_connections.sql")).isNotNull();
        assertThat(getClass().getResource("/db/manual/V2__private_jobs.sql")).isNotNull();
    }
}
