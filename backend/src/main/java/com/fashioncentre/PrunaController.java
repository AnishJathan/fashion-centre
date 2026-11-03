
package com.fashioncentre;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.MediaType;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/try-on")
public class PrunaController {

    private final PrunaService prunaService;

    public PrunaController(PrunaService prunaService) {
        this.prunaService = prunaService;
    }

    public record TryOnRequest(
            String personImageUrl,
            String garmentImageUrl
    ) {}

    //TO SUBMIT A TRY-ON REQUEST TO PRUNA API
    @PostMapping
    public Map<String, Object> submitTryOn(
            @RequestBody TryOnRequest request) {

        if (request.personImageUrl() == null
                || request.personImageUrl().isBlank()
                || request.garmentImageUrl() == null
                || request.garmentImageUrl().isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Person image URL and garment image URL are required"
            );
        }

        return prunaService.submitTryOn(
                request.personImageUrl(),
                request.garmentImageUrl()
        );
    }
    //TO GET THE PREDICTION STATUS FROM PRUNA API
    @GetMapping("/{predictionId}")
    public Map<String, Object> getPredictionStatus(
            @PathVariable String predictionId) {

        if (predictionId == null || predictionId.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Prediction ID is required"
            );
        }

        return prunaService.getPredictionStatus(predictionId);
    }

    //TO UPLOAD AN IMAGE TO PRUNA API
    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> uploadImage(
            @RequestParam("file") MultipartFile file) {

        if (file.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Please upload an image file"
            );
        }

        try {
            return prunaService.uploadImage(
                    file.getBytes(),
                    file.getOriginalFilename() != null
                            ? file.getOriginalFilename()
                            : "image.jpg"
            );
        } catch (java.io.IOException e) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Could not read uploaded image"
            );
        }
    }

}
