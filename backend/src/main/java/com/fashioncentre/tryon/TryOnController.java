package com.fashioncentre.tryon;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/try-on")
public class TryOnController {
    @GetMapping("/status") public Map<String,Object> status() {
        return Map.of("enabled",false,"provider","unselected","results",java.util.List.of(),
            "reason","Try-on generation is not enabled. No photos are uploaded.");
    }
    // No body binding, file processing, job creation or credential reading.
    @PostMapping("/jobs") public ResponseEntity<Map<String,String>> submit() {
        return ResponseEntity.status(501).body(Map.of("code","TRY_ON_DISABLED","message","Try-on generation is not enabled."));
    }
}
