package com.fashioncentre;

import java.io.IOException;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import org.apache.hc.client5.http.config.ConnectionConfig;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
import org.apache.hc.core5.util.Timeout;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PrunaService {
    private static final URI ORIGIN = URI.create("https://api.pruna.ai");
    private static final Pattern ID = Pattern.compile("[A-Za-z0-9_-]{1,128}");
    private static final Pattern DELIVERY_PATH =
            Pattern.compile("/v1/predictions/delivery/(?:[A-Za-z0-9_-]+/)+[A-Za-z0-9_-]+\\.jpe?g");
    private static final Set<String> STATUSES = Set.of("starting", "processing", "succeeded", "failed", "canceled");
    private static final int MAX_JSON_BYTES = 256 * 1024;
    private static final int MAX_RESULT_BYTES = 10 * 1024 * 1024;

    private final ObjectMapper json;
    private final CloseableHttpClient httpClient;
    private final RestClient restClient;

    public PrunaService(@Value("${pruna.api.key}") String apiKey, ObjectMapper json) {
        this.json = json;
        var connectionManager = PoolingHttpClientConnectionManagerBuilder.create()
                .setDefaultConnectionConfig(ConnectionConfig.custom()
                        .setConnectTimeout(Timeout.ofSeconds(5))
                        .setSocketTimeout(Timeout.ofSeconds(15))
                        .build())
                .build();
        this.httpClient = HttpClients.custom()
                .setConnectionManager(connectionManager)
                .setDefaultRequestConfig(RequestConfig.custom()
                        .setConnectionRequestTimeout(Timeout.ofSeconds(5))
                        .setResponseTimeout(Timeout.ofSeconds(15))
                        .build())
                .disableAutomaticRetries()
                .disableRedirectHandling()
                .build();
        this.restClient = RestClient.builder()
                .baseUrl(ORIGIN.toString())
                .defaultHeader("apikey", apiKey)
                .requestFactory(new HttpComponentsClientHttpRequestFactory(httpClient))
                .build();
    }

    public String submitTryOn(String personImageUrl, String garmentImageUrl) {
        var input = Map.of("person_image", personImageUrl, "garment_images", List.of(garmentImageUrl),
                "prompt", "", "output_format", "jpg");
        var response = readJson(restClient.post().uri("/v1/predictions")
                .header("Model", "p-image-try-on")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("input", input)));
        String id = response.path("id").asText("");
        if (!ID.matcher(id).matches()) {
            throw badGateway("Pruna did not return a valid prediction ID.");
        }
        return id;
    }

    public String predictionStatus(String predictionId) {
        return readStatus(predictionId).path("status").asText();
    }

    public String uploadImageAndGetUrl(byte[] imageBytes, String fileName) {
        var parts = new MultipartBodyBuilder();
        parts.part("content", new ByteArrayResource(imageBytes), MediaType.APPLICATION_OCTET_STREAM)
                .filename(fileName);

        var response = readJson(restClient.post().uri("/v1/files")
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(parts.build()));
        String url = response.path("urls").path("get").asText("");
        try {
            URI uri = URI.create(url);
            if ("https".equals(uri.getScheme()) && uri.getHost() != null && uri.getUserInfo() == null) {
                return url;
            }
        } catch (IllegalArgumentException ignored) {
            // Fall through to the same sanitized provider error.
        }
        throw badGateway("Pruna did not return a valid file URL.");
    }

    public byte[] downloadResult(String predictionId) {
        var response = readStatus(predictionId);
        if (!"succeeded".equals(response.path("status").asText())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The try-on is not finished yet.");
        }
        URI result = deliveryUri(response.path("generation_url").asText(""));
        byte[] image = readBytes(restClient.get().uri(result), MAX_RESULT_BYTES);
        if (image.length < 3 || image[0] != (byte) 0xff || image[1] != (byte) 0xd8 || image[2] != (byte) 0xff) {
            throw badGateway("Pruna did not return a JPEG result.");
        }
        return image;
    }

    private JsonNode readStatus(String predictionId) {
        if (!ID.matcher(predictionId).matches()) {
            throw badGateway("Invalid provider prediction ID.");
        }
        var response = readJson(restClient.get().uri("/v1/predictions/status/{id}", predictionId));
        if (!STATUSES.contains(response.path("status").asText(""))) {
            throw badGateway("Pruna returned an unknown prediction status.");
        }
        return response;
    }

    // The provider documents both absolute and root-relative references to its delivery endpoint.
    static URI deliveryUri(String url) {
        try {
            URI reference = URI.create(url);
            String path = reference.getRawPath();
            boolean absolute = reference.isAbsolute();
            if (path != null && DELIVERY_PATH.matcher(path).matches()
                    && reference.getRawQuery() == null && reference.getRawFragment() == null
                    && (absolute
                        ? "https".equals(reference.getScheme()) && ORIGIN.getRawAuthority().equals(reference.getRawAuthority())
                        : reference.getRawAuthority() == null)) {
                return ORIGIN.resolve(path);
            }
        } catch (IllegalArgumentException ignored) {
            // Fall through to the same sanitized provider error.
        }
        throw badGateway("Pruna did not return a valid delivery URL.");
    }

    private JsonNode readJson(RestClient.RequestHeadersSpec<?> request) {
        try {
            JsonNode body = json.readTree(readBytes(request, MAX_JSON_BYTES));
            if (body != null && body.isObject()) return body;
        } catch (IOException ignored) {
            // Fall through to the same sanitized provider error.
        }
        throw badGateway("Pruna returned an invalid response.");
    }

    private byte[] readBytes(RestClient.RequestHeadersSpec<?> request, int limit) {
        try {
            return request.exchange((outgoing, incoming) -> {
                if (!incoming.getStatusCode().is2xxSuccessful() || incoming.getHeaders().getContentLength() > limit) {
                    throw badGateway("Pruna could not complete the request.");
                }
                byte[] body = incoming.getBody().readNBytes(limit + 1);
                if (body.length == 0 || body.length > limit) {
                    throw badGateway("Pruna returned an invalid response size.");
                }
                return body;
            });
        } catch (RestClientException exception) {
            throw badGateway("Pruna could not complete the request.");
        }
    }

    private static ResponseStatusException badGateway(String reason) {
        return new ResponseStatusException(HttpStatus.BAD_GATEWAY, reason);
    }

    @PreDestroy
    void closeClient() throws IOException {
        httpClient.close();
    }
}
