
package com.fashioncentre.merchant;

import com.fashioncentre.auth.AuthService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;

import java.time.Clock;
import java.util.Optional;

import javax.sql.DataSource;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@Configuration
public class MerchantConfiguration {

    @Bean
    public Clock merchantClock() {
        return Clock.systemUTC();
    }

    @Bean
    @Lazy
    public JdbcConnections jdbcConnections(
            DataSource dataSource,
            AuthService authService,
            Clock merchantClock
    ) {
        return new JdbcConnections(
                dataSource,
                () -> {
                    var attributes =
                            RequestContextHolder.getRequestAttributes();

                    if (!(attributes instanceof ServletRequestAttributes servletAttributes)) {
                        return Optional.empty();
                    }

                    HttpServletRequest request =
                            servletAttributes.getRequest();

                    Cookie[] cookies = request.getCookies();

                    if (cookies == null) {
                        return Optional.empty();
                    }

                    for (Cookie cookie : cookies) {
                        if ("fc_session".equals(cookie.getName())) {
                            String token = cookie.getValue();

                            if (token == null || token.isBlank()) {
                                return Optional.empty();
                            }

                            return authService.currentSession(token)
                                    .map(session -> new JdbcConnections.Actor(
                                            session.getUser().getId(),
                                            session.getExpiresAt()
                                    ));
                        }
                    }

                    return Optional.empty();
                },
                merchantClock
        );
    }
}
