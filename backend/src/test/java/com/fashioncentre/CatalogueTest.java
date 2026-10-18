package com.fashioncentre;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
class CatalogueTest {
 private final CatalogueController api=new CatalogueController();
 @Test void scopesBrands(){assertEquals(2,api.products("violet").size());assertTrue(api.products("nimble").stream().allMatch(p->p.brandId().equals("nimble")));assertEquals(6,api.products(null).size());}
 @Test void rejectsUnknownIdentifiers(){assertThrows(ResponseStatusException.class,()->api.products("unknown"));assertThrows(ResponseStatusException.class,()->api.product("missing"));}
 @Test void reportsDemo(){assertEquals(true,api.health().get("demo"));assertEquals(3,api.brands().size());}
}
