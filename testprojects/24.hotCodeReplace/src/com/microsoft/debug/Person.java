package com.microsoft.debug;

public class Person {

    private String name;

    public Person(String name) {
        this.name = name;
    }

    public String getName() {
        String res = "old";
        for (int i = 0; i < 2; i++) {
            res += i;
        }
        res += this.getInternalName();
        return res;
    }

    public void setName(String name) {
        this.name = name;
    }

    private String getInternalName() {
        int i = 2; 
        NameProvider provider = new NameProvider("");
        i++;
        return provider.getName();
    }
}
