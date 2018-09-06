package com.github.kdvolder.helloworldservice;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;


@SpringBootApplication
@RestController
@EnableScheduling
public class DemoApplication {
	
	public static class Bar {
	}

	public static class Foo {
	}

	@Autowired(required=false) void foo(@Qualifier("foobar")Foo foo) {
		System.out.println("a Foo got injected");
	}

	@Autowired(required=false) void bar(@Qualifier("foobar")Bar bar) {
		System.out.println("a Bar got injected");
	}

	public static void main(String[] args) {
		SpringApplication.run(DemoApplication.class, args);
	}

	@GetMapping(value="/")
	public String mainpage() {
		return "Hello "+System.getProperty("greeting");
	}
	

	@GetMapping(value = "/hello/{name}")
	public String getMethodName(@PathVariable String name) {
		return "Hello "+name;
	}

	
	@Bean Foo foobar() {
		return new Foo();
	}
}
