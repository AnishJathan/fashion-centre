package com.fashioncentre;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import org.springframework.web.server.ResponseStatusException;
class CatalogueTest {
 @Test void reportsDemo(){assertEquals(true,new CatalogueController().health().get("demo"));}
 @Test void staticCatalogueIsRetired(){assertEquals(410,assertThrows(ResponseStatusException.class,()->new CatalogueController().retired()).getStatusCode().value());}
}
