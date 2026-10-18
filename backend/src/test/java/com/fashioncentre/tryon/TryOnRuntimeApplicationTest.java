package com.fashioncentre.tryon;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.multipart.MultipartResolver;
import com.fashioncentre.tryon.jobs.PrivateJobWorker;
import javax.sql.DataSource;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class TryOnRuntimeApplicationTest {
    @Autowired ApplicationContext application;
    @Autowired MockMvc mvc;

    @Test void actualApplicationHasNoMultipartResolverOrEnabledGeneration() throws Exception {
        assertThat(application.getBeansOfType(MultipartResolver.class)).isEmpty();
        assertThat(application.getBeansOfType(DataSource.class)).isEmpty();
        assertThat(application.getBeansOfType(PrivateJobWorker.class)).isEmpty();
        mvc.perform(get("/api/try-on/status"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.enabled").value(false))
                .andExpect(jsonPath("$.configuredAdapters").isEmpty());
        mvc.perform(post("/api/try-on/jobs").header("X-Owner-Id", "forged")
                        .contentType("image/png").content(new byte[]{0,1,2,3}))
                .andExpect(status().isNotImplemented()).andExpect(jsonPath("$.code").value("TRY_ON_DISABLED"));
    }
}
