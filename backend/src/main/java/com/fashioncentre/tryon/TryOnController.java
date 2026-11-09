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
            "blockers",List.of("The private-job pipeline is not wired to shopper authentication or asset delivery.",
                "Private-job repository and storage adapters are not configured.",
                "Private-job provider transport and worker scheduling are not installed."),
            "reason","Queued private-job generation is not enabled. This status does not describe the separate shopper upload and Pruna endpoints."));
    }
    // No body binding, file processing, job creation or credential reading.
    @PostMapping("/jobs") public ResponseEntity<Map<String,String>> submit() {
        return ResponseEntity.status(501).cacheControl(CacheControl.noStore()).body(Map.of("code","TRY_ON_DISABLED","message","Queued private-job generation is not enabled."));
    }
}
