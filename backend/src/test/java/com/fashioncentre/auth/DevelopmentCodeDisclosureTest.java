package com.fashioncentre.auth;

import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class DevelopmentCodeDisclosureTest {

    private ResultActions requestCode(String... profiles) throws Exception {
        var environment = new MockEnvironment();
        environment.setActiveProfiles(profiles);
        var service = new AuthService(mock(UserRepository.class), mock(LoginCodeRepository.class),
                mock(SessionRepository.class), mock(CodeSender.class), "test-pepper", true, environment);
        return MockMvcBuilders.standaloneSetup(new AuthController(service)).build().perform(
                post("/api/auth/request-code").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"phone\":\"+12025550199\"}"));
    }

    @Test
    void disclosureRequiresExplicitLocalProfileWithoutProd() throws Exception {
        requestCode().andExpect(status().isOk()).andExpect(jsonPath("$.devCode").doesNotExist());
        requestCode("local-auth", "prod").andExpect(status().isOk()).andExpect(jsonPath("$.devCode").doesNotExist());
        requestCode("local-auth").andExpect(status().isOk()).andExpect(jsonPath("$.devCode").isString());
    }
}
