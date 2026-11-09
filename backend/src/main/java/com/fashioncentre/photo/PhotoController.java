package com.fashioncentre.photo;

import java.io.IOException;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import com.fashioncentre.auth.AuthService;
import com.fashioncentre.auth.User;

import lombok.RequiredArgsConstructor;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/users/me")
@RequiredArgsConstructor
public class PhotoController {

    private final AuthService auth;
    private final PhotoService photos;
    private final PhotoStorage storage;

    @PostMapping(value = "/photo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Void> upload(
            @CookieValue(name = "fc_session", required = false) String token,
            @RequestParam("file") MultipartFile file) throws IOException {

        User user = auth.currentUser(token).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        photos.saveUserPhoto(user, file);
        return ResponseEntity.noContent().build();
    }

// Returns the signed-in user's saved photo, so the try-on panel can show it
@GetMapping("/photo")
public ResponseEntity<byte[]> myPhoto(
        @CookieValue(name = "fc_session", required = false) String token) {

    User user = auth.currentUser(token).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    if (user.getPhotoPublicId() == null) {
        return ResponseEntity.notFound().build();
    }
    return ResponseEntity.ok()
            .contentType(MediaType.IMAGE_JPEG)
            .cacheControl(CacheControl.noStore())
            .body(storage.download(user.getPhotoPublicId()));
}
}