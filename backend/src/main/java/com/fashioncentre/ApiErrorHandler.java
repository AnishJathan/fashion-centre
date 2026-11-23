package com.fashioncentre;

import java.util.Map;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
class ApiErrorHandler {
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<Map<String, String>> expectedError(ResponseStatusException error) {
        var response = ResponseEntity.status(error.getStatusCode())
                .headers(error.getHeaders())
                .cacheControl(CacheControl.noStore());
        String reason = error.getReason();
        return reason == null ? response.build() : response.body(Map.of("message", reason));
    }
}
