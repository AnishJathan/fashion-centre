package com.fashioncentre;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
@RestController @RequestMapping("/api")
public class CatalogueController {
 public record Brand(String id,String name,String tagline,String color,String image) {}
 public record Product(String id,String brandId,String name,int price,String category,String vibe,String image,String color) {}
 private final List<Brand> brands=List.of(new Brand("violet","STUDIO VIOLET","A little bold. Entirely you.","#7041d9","/images/campaign.png"),new Brand("nimble","NIMBLE SUPPLY","Made for the everyday adventure.","#24604f","/images/campaign.png"),new Brand("lume","lume studio","Quiet confidence. Lasting impressions.","#98512f","/images/denim.png"));
 private final List<Product> products=List.of(new Product("p1","violet","Everyday denim",119,"Denim","City muse","/images/denim.png","Denim blue"),new Product("p2","nimble","Relaxed Overshirt",89,"Tops","Off duty","/images/campaign.png","White"),new Product("p3","lume","Wide Leg Jeans",129,"Denim","Golden hour","/images/denim.png","Denim blue"),new Product("p4","violet","Relaxed cotton shirt",79,"Tops","Off duty","/images/campaign.png","Cloud white"),new Product("p5","nimble","The everyday sneaker",119,"Sneakers","Off duty","/images/shoes.jpg","White"),new Product("p6","lume","After hours edit",169,"Dresses","City muse","/images/evening.jpg","Midnight"));
 @GetMapping("/health") public Map<String,Object> health(){return Map.of("status","ok","demo",true);}
 @GetMapping("/brands") public List<Brand> brands(){return brands;}
 @GetMapping("/products") public List<Product> products(@RequestParam(required=false) String brandId){if(brandId!=null&&brands.stream().noneMatch(b->b.id().equals(brandId)))throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Unknown brand");return products.stream().filter(p->brandId==null||p.brandId().equals(brandId)).toList();}
 @GetMapping("/products/{id}") public Product product(@PathVariable String id){return products.stream().filter(p->p.id().equals(id)).findFirst().orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Unknown product"));}
}
