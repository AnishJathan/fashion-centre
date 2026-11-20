package fashioncentre.demo;

import com.fashioncentre.CatalogueController;
import com.fashioncentre.merchant.MerchantController;
import com.fashioncentre.shopify.ShopifyController;
import com.fashioncentre.tryon.TryOnController;
import java.util.Map;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

// Import the demo controllers explicitly to exclude account, storage and provider components.
@Configuration(proxyBeanMethods = false)
@EnableAutoConfiguration(exclude = DataSourceAutoConfiguration.class)
@Import({CatalogueController.class, ShopifyController.class, MerchantController.class,
        TryOnController.class, DemoApi.PreviewSession.class})
public class DemoApi {
    public static void main(String[] args) {
        SpringApplication.run(DemoApi.class, args);
    }

    @RestController
    static class PreviewSession {
        @GetMapping("/api/auth/me")
        ResponseEntity<Map<String, String>> signedOut() {
            return ResponseEntity.status(401)
                    .cacheControl(CacheControl.noStore())
                    .body(Map.of("message", "Sign-in requires a configured backend"));
        }
    }
}
