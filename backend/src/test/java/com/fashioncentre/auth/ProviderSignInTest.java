package com.fashioncentre.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashioncentre.PrunaService;
import jakarta.servlet.http.Cookie;
import java.net.URI;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.util.UriComponentsBuilder;
import software.amazon.awssdk.services.s3.S3Client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.doReturn;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:provider-sign-in;MODE=MySQL;DB_CLOSE_DELAY=-1;INIT=RUNSCRIPT FROM 'classpath:/db/provider-sign-in-schema.sql'",
    "spring.datasource.driver-class-name=org.h2.Driver",
    "spring.datasource.username=sa",
    "spring.datasource.password=",
    "spring.jpa.hibernate.ddl-auto=create-drop",
    "spring.flyway.enabled=false",
    "auth.code-pepper=fixture",
    "r2.bucket=fixture",
    "auth.public-origin=https://fashion.example",
    "auth.google-client-id=fixture-google",
    "auth.google-client-secret=fixture-google-secret",
    "SHOPIFY_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "auth.shopify-client-id=fixture-shopify",
    "auth.shopify-client-secret=fixture-shopify-secret",
    "shopify.client-id=fixture-shopify",
    "shopify.client-secret=fixture-shopify-secret",
    "shopify.redirect-uri=https://fashion.example/api/merchant/shopify/callback"
})

@AutoConfigureMockMvc
class ProviderSignInTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @MockitoBean S3Client s3;
    @MockitoBean PrunaService pruna;
    @MockitoSpyBean SignInProviders providers;
    static final String BASE = "/api/auth/sign-in/", SHOP = "fixture.myshopify.com";

    record Flow(String provider, String verifier, String state, Cookie binding) {}

    private Flow begin(String provider, String platform) throws Exception {
        String body = json.writeValueAsString(Map.of("platform",platform,"shop",SHOP));
        var start = mvc.perform(post(BASE + provider + "/start").contentType("application/json").content(body))
                .andExpect(status().isOk()).andReturn().getResponse();
        JsonNode data = json.readTree(start.getContentAsString());
        var response = mvc.perform(get(URI.create(data.get("url").asText()))).andExpect(status().isSeeOther()).andReturn().getResponse();
        var location = UriComponentsBuilder.fromUriString(response.getRedirectedUrl()).build();
        Cookie binding = response.getCookies()[0];
        assertThat(binding.isHttpOnly()).isTrue();
        assertThat(binding.getSecure()).isTrue();
        assertThat(location.getHost()).isEqualTo(provider.equals("google") ? "accounts.google.com" : SHOP);
        return new Flow(provider, data.path("verifier").asText(null), location.getQueryParams().getFirst("state"), binding);
    }

    private MockHttpServletResponse callback(Flow flow) throws Exception {
        return mvc.perform(get(BASE+flow.provider()+"/callback").param("state", flow.state()).param("code","fixture-code")
                .cookie(flow.binding())).andExpect(status().isSeeOther()).andReturn().getResponse();
    }

    @Test void googleWebUsesVerifiedSubjectForReturningShoppersAndRevokesSessionOnLogout() throws Exception {
        doReturn(new SignInProviders.Identity("fixture-sub", "Sam", null)).when(providers).exchange(eq("google"), isNull(), anyMap(), anyString());
        String id = null;
        for (int visit = 0; visit < 2; visit++) {
            var flow = begin("google", "web");
            var response = callback(flow);
            assertThat(response.getRedirectedUrl()).isEqualTo("https://fashion.example/?signin=success#/login");
            Cookie session = response.getCookie(AuthController.SESSION_COOKIE);
            var me = mvc.perform(get("/api/auth/me").cookie(session)).andExpect(status().isOk())
                    .andExpect(jsonPath("$.phone").value("")).andExpect(jsonPath("$.firstName").value("Sam"))
                    .andExpect(jsonPath("$.hasPhoto").value(false)).andReturn().getResponse();
            String currentId = json.readTree(me.getContentAsString()).get("id").asText();
            if (visit == 0) id = currentId;
            assertThat(currentId).isEqualTo(id);
            mvc.perform(get(BASE+"shopify/me").cookie(session)).andExpect(status().isUnauthorized());
            mvc.perform(post("/api/auth/logout").cookie(session)).andExpect(status().isNoContent());
            mvc.perform(get("/api/auth/me").cookie(session)).andExpect(status().isUnauthorized());
        }
    }

    @Test void nativeMerchantRequiresBothOneTimeProofsAndGetsOnlyTheVerifiedStoreSession() throws Exception {
        var flow = begin("shopify", "native");
        doReturn(new SignInProviders.Identity("42", null, Instant.now().plusSeconds(900)))
                .when(providers).exchange(eq("shopify"),eq(SHOP),anyMap(),anyString());
        mvc.perform(get(BASE+"shopify/callback").param("state",flow.state()).param("code","fixture")).andExpect(status().isBadRequest());
        var response = callback(flow);
        assertThat(response.getCookie(SignInStore.MERCHANT_COOKIE)).isNull();
        assertThat(response.getRedirectedUrl()).startsWith(SignInProviders.APP_RETURN + "?grant=");
        String grant = UriComponentsBuilder.fromUriString(response.getRedirectedUrl()).build().getQueryParams().getFirst("grant");
        assertThat(response.getRedirectedUrl()).doesNotContain(flow.verifier());
        mvc.perform(get(BASE+"shopify/callback").param("state",flow.state()).param("code","fixture").cookie(flow.binding()))
                .andExpect(status().isBadRequest());
        String valid = json.writeValueAsString(Map.of("grant",grant,"verifier",flow.verifier()));
        mvc.perform(post(BASE+"google/finish").contentType("application/json").content(valid)).andExpect(status().isBadRequest());
        mvc.perform(post(BASE+"shopify/finish").contentType("application/json")
                .content(json.writeValueAsString(Map.of("grant",grant,"verifier",SignInStore.token())))).andExpect(status().isBadRequest());
        Cookie session = mvc.perform(post(BASE+"shopify/finish").contentType("application/json").content(valid))
                .andExpect(status().isNoContent()).andReturn().getResponse().getCookie(SignInStore.MERCHANT_COOKIE);
        mvc.perform(post(BASE+"shopify/finish").contentType("application/json").content(valid)).andExpect(status().isBadRequest());
        mvc.perform(get(BASE+"shopify/me").cookie(session)).andExpect(status().isOk()).andExpect(jsonPath("$.shop").value(SHOP));
        mvc.perform(get("/api/auth/me").cookie(session)).andExpect(status().isUnauthorized());
        mvc.perform(post(BASE+"shopify/logout").cookie(session)).andExpect(status().isNoContent());
        mvc.perform(get(BASE+"shopify/me").cookie(session)).andExpect(status().isUnauthorized());
    }

    @Test void cancellationReturnsToTheInitiatingClientAndBadStoreIsRejected() throws Exception {
        var flow = begin("google", "native");
        mvc.perform(get(BASE+"google/callback").param("state",flow.state()).param("error","access_denied").cookie(flow.binding()))
                .andExpect(status().isSeeOther()).andExpect(redirectedUrl(SignInProviders.APP_RETURN+"?signin=cancelled"));
        mvc.perform(post(BASE+"shopify/start").contentType("application/json")
                .content("{\"platform\":\"web\",\"shop\":\"other.example\"}")).andExpect(status().isBadRequest());
    }
}
