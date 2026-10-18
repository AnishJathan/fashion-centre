package com.fashioncentre.tryon;

import java.util.Map;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/try-on")
public class TryOnController {
    @GetMapping("/status") public ResponseEntity<Map<String,Object>> status() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of(
            "enabled",false,"provider","unselected","results",List.of(),
            "configuredAdapters",List.of(),
            "blockers",List.of("Verified authentication and private asset delivery are not installed.",
                "A runtime datasource and private object storage are not configured.",
                "Production provider transport and worker scheduling are not installed."),
            "reason","Try-on generation is not enabled. No photos are uploaded."));
    }
    // No body binding, file processing, job creation or credential reading.
    @PostMapping("/jobs") public ResponseEntity<Map<String,String>> submit() {
        return ResponseEntity.status(501).cacheControl(CacheControl.noStore()).body(Map.of("code","TRY_ON_DISABLED","message","Try-on generation is not enabled."));
    }
}
