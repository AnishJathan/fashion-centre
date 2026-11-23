package com.fashioncentre.photo;

import java.io.IOException;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;

@Service
@RequiredArgsConstructor
public class PhotoStorage {

    static final int MAX_PHOTO_BYTES = 10 * 1024 * 1024;
    private final S3Client s3;

    @Value("${r2.bucket}")
    private String bucket;

    public byte[] download(String key) {
        var request = GetObjectRequest.builder()
                .bucket(bucket)
                .key(key)
                .build();
        try (var stream = s3.getObject(request)) {
            var length = stream.response().contentLength();
            if (length != null && length > MAX_PHOTO_BYTES) {
                stream.abort();
                throw unavailable();
            }
            byte[] jpeg = stream.readNBytes(MAX_PHOTO_BYTES + 1);
            if (jpeg.length == 0 || jpeg.length > MAX_PHOTO_BYTES) {
                stream.abort();
                throw unavailable();
            }
            return jpeg;
        } catch (IOException | SdkException exception) {
            throw unavailable();
        }
    }

    private static ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.BAD_GATEWAY, "The saved photo could not be loaded.");
    }
}
