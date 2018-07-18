package com.microsoft.app;

import java.nio.file.Paths;

public class Launcher {
    public static void main(String[] args) {
        System.out.println(Paths.get("").toAbsolutePath().toString());

        System.out.println(System.getenv("Path"));
    }
}