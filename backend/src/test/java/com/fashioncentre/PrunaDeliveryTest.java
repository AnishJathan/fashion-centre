package com.fashioncentre;

import java.net.URI;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

class PrunaDeliveryTest {
    @Test
    void documentedDeliveryReferencesResolveToTheAuthenticatedProviderEndpoint() {
        String path = "/v1/predictions/delivery/project/receipt/output.jpg";
        URI expected = URI.create("https://api.pruna.ai" + path);
        assertThat(PrunaService.deliveryUri(path)).isEqualTo(expected);
        assertThat(PrunaService.deliveryUri(expected.toString())).isEqualTo(expected);
    }

    @Test
    void unexpectedDeliveryOriginIsRejectedBeforeTransport() {
        var error = assertThrows(ResponseStatusException.class,
                () -> PrunaService.deliveryUri("https://example.invalid/v1/predictions/delivery/project/output.jpg"));
        assertThat(error.getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
    }
}
