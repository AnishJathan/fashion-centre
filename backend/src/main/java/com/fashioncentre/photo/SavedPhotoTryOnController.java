package com.fashioncentre;

import java.io.IOException;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import com.fashioncentre.auth.AuthService;
import com.fashioncentre.auth.User;
import com.fashioncentre.photo.PhotoStorage;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/try-on")
@RequiredArgsConstructor
public class SavedPhotoTryOnController {

    private final AuthService auth;
    private final PhotoStorage photos;
    private final PrunaService pruna;

    // Starts a try-on using the signed-in user's saved photo and the product image sent by the frontend
    @PostMapping(value = "/me", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> tryOnWithSavedPhoto(
            @CookieValue(name = "fc_session", required = false) String token,
            @RequestParam("garment") MultipartFile garment) throws IOException {

        User user = auth.currentUser(token).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.UNAUTHORIZED));

        if (user.getPhotoPublicId() == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Add your full-body photo first.");
        }

        byte[] person = photos.download(user.getPhotoPublicId());
        String personUrl = pruna.uploadImageAndGetUrl(person, "person.jpg");
        String garmentUrl = pruna.uploadImageAndGetUrl(garment.getBytes(), "garment.jpg");

        Map<String, Object> prediction = pruna.submitTryOn(personUrl, garmentUrl);
        return Map.of("id", String.valueOf(prediction.get("id")));
    }
}