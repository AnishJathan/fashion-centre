package com.fashioncentre.photo;

import java.net.URI;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

@Configuration
public class R2Config {

    @Bean
    S3Client s3Client(@Value("${r2.account-id}") String rawAccountId,
                      @Value("${r2.access-key-id}") String accessKey,
                      @Value("${r2.secret-access-key}") String secretKey) {

        // Accept a pasted URL too, and keep only the account ID
        String accountId = rawAccountId
                .replaceAll("^https?://", "")
                .replaceAll("\\.r2\\.cloudflarestorage\\.com.*$", "")
                .replaceAll("/.*$", "");

        return S3Client.builder()
                .endpointOverride(URI.create("https://" + accountId + ".r2.cloudflarestorage.com"))
                .region(Region.of("auto"))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(accessKey, secretKey)))
                .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
                .responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
                .build();
    }
}
