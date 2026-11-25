package com.fashioncentre.tryon;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;

import com.fashioncentre.PrunaService;
import com.fashioncentre.auth.AuthService;
import com.fashioncentre.auth.AuthSession;
import com.fashioncentre.auth.LoginCode;
import com.fashioncentre.auth.LoginCodeRepository;
import com.fashioncentre.auth.SessionRepository;
import com.fashioncentre.auth.User;
import com.fashioncentre.auth.UserRepository;
import com.fashioncentre.tryon.jobs.PrivateJobWorker;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.multipart.MultipartResolver;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;

import javax.sql.DataSource;

import static com.fashioncentre.auth.AuthController.SESSION_COOKIE;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// Isolated in-memory auth schema. No production datasource, credentials or provider calls.
@SpringBootTest(properties={
    "spring.datasource.url=jdbc:h2:mem:combined-runtime;DB_CLOSE_DELAY=-1;INIT=RUNSCRIPT FROM 'classpath:/db/manual/merchant-test-schema.sql'",
    "SHOPIFY_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "spring.datasource.driver-class-name=org.h2.Driver",
    "spring.datasource.username=sa", "spring.datasource.password=",
    "spring.jpa.hibernate.ddl-auto=create-drop", "spring.flyway.enabled=false",
    "shopify.client-id=fixture-shopify",
    "shopify.client-secret=fixture-shopify-secret",
    "shopify.redirect-uri=https://fashion.example/api/merchant/shopify/callback",
    "auth.code-pepper=test-only-not-a-secret", "r2.bucket=test-only"
})
@AutoConfigureMockMvc
class TryOnRuntimeApplicationTest {
    @Autowired ApplicationContext application;
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired SessionRepository sessions;
    @Autowired LoginCodeRepository codes;
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

    @Test void legacyProviderRoutesAreGoneAndAnonymousShoppersCannotAccessSavedPhotosOrPredictions() throws Exception {
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/users/me/photo")).andExpect(status().isUnauthorized());
        mvc.perform(multipart("/api/try-on/me").file("garment", new byte[]{1,2,3}))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/try-on/unknown")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/try-on/unknown/result")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/try-on").contentType("application/json").content("{}"))
                .andExpect(status().isNotFound());
        mvc.perform(multipart("/api/try-on/upload").file("file", new byte[]{1,2,3}))
                .andExpect(status().isMethodNotAllowed());
        verifyNoInteractions(s3, pruna);
    }

    @Test void predictionStatusAndImageArePrivateToTheAccountThatStartedThePrediction() throws Exception {
        Cookie owner = session("+12025550101", "test-owner-token", "users/owner/photo");
        Cookie viewer = session("+12025550102", "test-viewer-token", null);
        byte[] garment = {1, 2, 3};
        byte[] person = {4, 5, 6};
        byte[] result = {7, 8, 9};
        when(s3.getObject(any(GetObjectRequest.class)))
                .thenReturn(new ResponseInputStream<>(GetObjectResponse.builder().contentLength((long) person.length).build(),
                        new ByteArrayInputStream(person)));
        when(pruna.uploadImageAndGetUrl(person, "person.jpg")).thenReturn("https://example.invalid/person");
        when(pruna.uploadImageAndGetUrl(garment, "garment.jpg")).thenReturn("https://example.invalid/garment");
        when(pruna.submitTryOn("https://example.invalid/person", "https://example.invalid/garment"))
                .thenReturn("provider-receipt");
        when(pruna.predictionStatus("provider-receipt")).thenReturn("succeeded");
        when(pruna.downloadResult("provider-receipt")).thenReturn(result);

        var response = mvc.perform(multipart("/api/try-on/me").file("garment", garment).cookie(owner))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andReturn().getResponse();
        String id = json.readTree(response.getContentAsByteArray()).path("id").asText();
        assertThat(id).matches("[a-f0-9-]{36}").isNotEqualTo("provider-receipt");
        String path = "/api/try-on/" + id;

        mvc.perform(get(path).cookie(viewer)).andExpect(status().isNotFound());
        mvc.perform(get(path + "/result").cookie(viewer)).andExpect(status().isNotFound());
        mvc.perform(get(path).cookie(owner)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.status").value("succeeded"));
        mvc.perform(get(path + "/result").cookie(owner)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(content().contentType("image/jpeg")).andExpect(content().bytes(result));
        verify(pruna).predictionStatus("provider-receipt");
        verify(pruna).downloadResult("provider-receipt");
    }

    @Test void defaultProfileDoesNotIssueUndeliverableCodes() throws Exception {
        String phone = "+12025550103";
        mvc.perform(post("/api/auth/request-code").contentType("application/json")
                        .content(json.writeValueAsBytes(Map.of("phone", phone))))
                .andExpect(status().isServiceUnavailable());
        assertThat(codes.findFirstByPhoneNumberOrderByCreatedAtDesc(phone)).isEmpty();
    }

    @Test void consumingLatestCodeDoesNotReactivateAnOlderCode() throws Exception {
        String phone = "+12025550104";
        Instant now = Instant.now();
        codes.save(loginCode(phone, "123456", now.minusSeconds(45), false));
        codes.save(loginCode(phone, "654321", now.minusSeconds(10), true));
        mvc.perform(post("/api/auth/verify-code").contentType("application/json")
                        .content(json.writeValueAsBytes(Map.of("phone", phone, "code", "123456"))))
                .andExpect(status().isGone());
    }

    @Test void manualSchemasCannotBeDiscoveredByFlywayDefaultLocation() {
        assertThat(getClass().getResource("/db/migration/V1__auth_tables.sql")).isNotNull();
        assertThat(getClass().getResource("/db/migration/V5__saved_photo_predictions.sql")).isNotNull();
        assertThat(getClass().getResource("/db/migration/V1__merchant_connections.sql")).isNull();
        assertThat(getClass().getResource("/db/migration/V2__private_jobs.sql")).isNull();
        assertThat(getClass().getResource("/db/manual/V1__merchant_connections.sql")).isNotNull();
        assertThat(getClass().getResource("/db/manual/V2__private_jobs.sql")).isNotNull();
    }

    private Cookie session(String phone, String token, String photoKey) throws Exception {
        User user = new User();
        user.setPhoneNumber(phone);
        user.setPhotoPublicId(photoKey);
        AuthSession session = new AuthSession();
        session.setUser(users.save(user));
        session.setTokenHash(sha256(token));
        session.setCreatedAt(Instant.now());
        session.setExpiresAt(Instant.now().plusSeconds(60));
        sessions.save(session);
        return new Cookie(SESSION_COOKIE, token);
    }

    private static LoginCode loginCode(String phone, String code, Instant createdAt, boolean used) throws Exception {
        LoginCode loginCode = new LoginCode();
        loginCode.setPhoneNumber(phone);
        loginCode.setCodeHash(sha256("test-only-not-a-secret:" + phone + ":" + code));
        loginCode.setCreatedAt(createdAt);
        loginCode.setExpiresAt(createdAt.plusSeconds(120));
        loginCode.setUsed(used);
        return loginCode;
    }

    private static String sha256(String value) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8)));
    }
}
