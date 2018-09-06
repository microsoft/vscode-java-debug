package com.github.kdvolder.helloworldservice;

import org.springframework.stereotype.Component;


@Component
public class Greeter {

    String greeting(String name) {
        return "Hello "+name;
    }

}