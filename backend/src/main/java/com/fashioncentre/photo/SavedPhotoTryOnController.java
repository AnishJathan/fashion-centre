
package com.fashioncentre.photo;

import java.io.IOException;
import java.util.Map;

import com.fashioncentre.PrunaService;
import com.fashioncentre.auth.AuthService;
import com.fashioncentre.auth.User;
import lombok.RequiredArgsConstructor;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import static com.fashioncentre.auth.AuthController.SESSION_COOKIE;

@RestController
@RequestMapping("/api/try-on")
@RequiredArgsConstructor
public class SavedPhotoTryOnController {
    private final AuthService auth;
    private final PhotoStorage photos;
    private final PrunaService pruna;
    private final SavedPhotoPredictionRepository predictions;

    @PostMapping(value = "/me", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, String>> start(
            @CookieValue(name = SESSION_COOKIE, required = false) String token,
            @RequestParam("garment") MultipartFile garment) throws IOException {

        User user = requireUser(token);

        if (user.getPhotoPublicId() == null) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "Add your full-body photo first.");
        }

        if (garment.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Add a garment image.");
        }

        byte[] garmentBytes = garment.getBytes();
        byte[] personBytes = photos.download(user.getPhotoPublicId());

        String personUrl = pruna.uploadImageAndGetUrl(personBytes, "person.jpg");
        String garmentUrl = pruna.uploadImageAndGetUrl(garmentBytes, "garment.jpg");

        String providerId = pruna.submitTryOn(personUrl, garmentUrl);

        var prediction = predictions.save(
                new SavedPhotoPrediction(user.getId(), providerId));

        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(Map.of("id", prediction.id()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String, String>> status(
            @CookieValue(name = SESSION_COOKIE, required = false) String token,
            @PathVariable String id) {

        var prediction = requirePrediction(token, id);

        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(Map.of("status", pruna.predictionStatus(prediction.providerId())));
    }

    @GetMapping("/{id}/result")
    public ResponseEntity<byte[]> result(
            @CookieValue(name = SESSION_COOKIE, required = false) String token,
            @PathVariable String id) {

        var prediction = requirePrediction(token, id);

        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .contentType(MediaType.IMAGE_JPEG)
                .body(pruna.downloadResult(prediction.providerId()));
    }

    private User requireUser(String token) {
        return auth.currentUser(token)
                .orElseThrow(() ->
                        new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }

    private SavedPhotoPrediction requirePrediction(String token, String id) {
        User user = requireUser(token);
        var notFound = new ResponseStatusException(HttpStatus.NOT_FOUND);

        if (id.length() != 36) {
            throw notFound;
        }

        return predictions.findByIdAndUserId(id, user.getId())
                .orElseThrow(() -> notFound);
    }
}
