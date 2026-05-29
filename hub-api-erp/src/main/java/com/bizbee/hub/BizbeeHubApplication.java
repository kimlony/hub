package com.bizbee.hub;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class BizbeeHubApplication {

    public static void main(String[] args) {
        SpringApplication.run(BizbeeHubApplication.class, args);
    }
}
