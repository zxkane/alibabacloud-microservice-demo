package com.alibabacloud.hipstershop.dao;

import com.alibabacloud.hipstershop.domain.Product;
import com.amazonaws.xray.proxies.apache.http.HttpClientBuilder;
import com.amazonaws.xray.spring.aop.XRayEnabled;
import feign.Client;
import feign.Logger;
import feign.httpclient.ApacheHttpClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

import java.util.List;

@Service
@XRayEnabled
public class ProductDAO {

    @Autowired
    private ProductService productService;

    public Product getProductById(String id) {
        return productService.getProductById(id);
    }

    public List<Product> getProductList() {
        return productService.getProductList();
    }

    @Configuration
    public class FeignConfiguration {
        @Bean
        public Logger.Level feignLogger() {
            return Logger.Level.FULL;
        }

        @Bean
        public Client feignClient() {
            return new ApacheHttpClient(HttpClientBuilder.create().build());
        }
    }

    @FeignClient(name = "productservice", url="${service.product.url}",
        configuration=FeignConfiguration.class)
    @XRayEnabled
    public interface ProductService {

        @GetMapping("/products/")
        List<Product> getProductList();

        @GetMapping("/product/{id}")
        Product getProductById(@PathVariable(name = "id") String id);
    }
}
