package com.alibabacloud.hipstershop.web;

import com.alibabacloud.hipstershop.CartItem;
import com.alibabacloud.hipstershop.dao.CartDAO;
import com.alibabacloud.hipstershop.dao.ProductDAO;
import com.alibabacloud.hipstershop.domain.Product;
import com.amazonaws.xray.spring.aop.XRayEnabled;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.view.RedirectView;

import java.util.List;
import java.util.Random;

/**
 * @author wangtao 2019-08-12 15:41
 */
@Controller
@XRayEnabled
public class AppController {

    @Autowired
    private ProductDAO productDAO;

    @Autowired
    private CartDAO cartDAO;

    private Random random = new Random(System.currentTimeMillis());

    private String userID = "Test User";

    @GetMapping("/")
    public String index(Model model) {
        model.addAttribute("products", productDAO.getProductList());
        return "index.html";
    }

    @GetMapping("/greeting")
    public String greeting(@RequestParam(name="name", required=false, defaultValue="World") String name, Model model) {
        model.addAttribute("name", name);
        return "home";
    }


    @GetMapping("/exception")
    public String exception() {

        throw new RuntimeException();
    }

    @GetMapping("/exception2")
    public String excpetion2(){

        int i = 20 / 0;
        return "hello";
    }

    @GetMapping("/checkout")
    public String checkout() {

        if(random.nextBoolean()){
            throw new RuntimeException();
        }

        return "not support yet";
    }

    @GetMapping("/product/{id}")
    public String product(@PathVariable(name="id") String id, Model model) {
        Product p = productDAO.getProductById(id);
        model.addAttribute("product", p);
        return "product.html";
    }

    @GetMapping("/cart")
    public String viewCart(Model model) {
        List<CartItem> items = cartDAO.viewCart(userID);
        for (CartItem item: items) {
            Product p = productDAO.getProductById(item.productID);
            item.productName = p.getName();
            item.price = p.getPrice();
            item.productPicture = p.getPicture();
        }
        model.addAttribute("items", items);
        return "cart.html";
    }

    @PostMapping("/cart")
    public RedirectView addToCart(@RequestParam(name="product_id") String productID,
                                  @RequestParam(name="quantity") int quantity) {
        cartDAO.addToCart(userID, productID, quantity);
        return new RedirectView("/cart");
    }

    @PostMapping("/cart/empty")
    public RedirectView emptyCart() {
        cartDAO.emptyCart(userID);
        return new RedirectView("/cart");
    }

    @ModelAttribute("cartSize")
    public int getCartSize() {
        return cartDAO.viewCart(userID).size();
    }

}
