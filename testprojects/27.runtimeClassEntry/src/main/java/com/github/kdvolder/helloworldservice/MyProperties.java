package com.github.kdvolder.helloworldservice;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.DeprecatedConfigurationProperty;

@ConfigurationProperties("my")
public class MyProperties {

    private String hello;

	/**
	 * @return the hello
	 */
    @DeprecatedConfigurationProperty(replacement="new.my.hello")
	public String getHello() {
		return hello;
	}

	/**
	 * @param hello the hello to set
	 */
	public void setHello(String hello) {
		this.hello = hello;
	}

}