
package com.fashioncentre;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.http.HttpHeaders;

import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;


@Service
public class PrunaService {

    private final RestClient restClient;

    public PrunaService(
            @Value("${pruna.api.key}") String apiKey) {

        CloseableHttpClient httpClient = HttpClients.custom()
                .disableAutomaticRetries()
                .build();

        HttpComponentsClientHttpRequestFactory requestFactory =
                new HttpComponentsClientHttpRequestFactory(httpClient);

        this.restClient = RestClient.builder()
                .baseUrl("https://api.pruna.ai")
                .defaultHeader("apikey", apiKey)
                .requestFactory(requestFactory)
                .build();
    }

    //TO SUBMIT A TRY-ON REQUEST TO PRUNA API
    public Map<String, Object> submitTryOn(
            String personImageUrl,
            String garmentImageUrl) {

        Map<String, Object> input = Map.of(
                "person_image", personImageUrl,
                "garment_images", List.of(garmentImageUrl),
                "prompt", ""
        );

        Map<String, Object> requestBody = Map.of(
                "input", input
        );

        return restClient.post()
                .uri("/v1/predictions")
                .header("Model", "p-image-try-on")
                .contentType(MediaType.APPLICATION_JSON)
                .body(requestBody)
                .retrieve()
                .body(Map.class);
    }

    //TO GET THE PREDICTION STATUS FROM PRUNA API
    public Map<String, Object> getPredictionStatus(String predictionId) {
        try {
            return restClient.get()
                    .uri("/v1/predictions/status/{id}", predictionId)
                    .retrieve()
                    .body(Map.class);
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_GATEWAY,
                    "Pruna API returned an error while checking prediction status: "
                            + e.getStatusCode()
            );
        }
    }


    //TO UPLAOD THE IMAGE TO PRUNA API
    
    public Map<String, Object> uploadImage(byte[] imageBytes, String fileName) {
        ByteArrayResource fileResource = new ByteArrayResource(imageBytes) {
            @Override
            public String getFilename() {
                return fileName;
            }
        };

        HttpHeaders fileHeaders = new HttpHeaders();
        fileHeaders.setContentType(MediaType.APPLICATION_OCTET_STREAM);
        fileHeaders.setContentDispositionFormData("content", fileName);

        HttpEntity<ByteArrayResource> filePart =
                new HttpEntity<>(fileResource, fileHeaders);

        LinkedMultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("content", filePart);

        return restClient.post()
                .uri("/v1/files")
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(body)
                .retrieve()
                .body(Map.class);
    }



}
