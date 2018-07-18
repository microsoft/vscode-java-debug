package com.microsoft.debug;

public class NameProvider {

    public String fieldName;

    public NameProvider(String fieldName) {
        this.fieldName = fieldName;
    }

    public String getName() {
        return " + Provider" + this.fieldName;
    }
}