package com.alibaba.edas.boot;

import com.alibaba.dubbo.config.annotation.Service;
import org.apache.dubbo.registry.Registry;

@Service(application = "${dubbo.application.id}",
    protocol = "${dubbo.protocol.id}",
    registry = "${dubbo.registry.id}"
)
public class HelloServiceImpl implements IHelloService {

    public String sayHello(String name) {
        return "Hello, " + name + " Normal ";
    }
}