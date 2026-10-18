package com.fashioncentre;
import java.util.Map;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
@RestController @RequestMapping("/api")
public class CatalogueController {
 @GetMapping("/health") public Map<String,Object> health(){return Map.of("status","ok","demo",true);}
 @GetMapping({"/brands","/products","/products/{id}"}) public void retired(){throw new ResponseStatusException(HttpStatus.GONE,"Static catalogue retired. Onboard a demo store and use its scoped catalogue.");}
}
