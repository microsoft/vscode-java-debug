package com.microsoft.app;

import com.google.gson.Gson;

public class App 
{
    public static void main( String[] args )
    {
        Gson GSON = new Gson();
        String name = "jinbwan";
        Employee employee = GSON.fromJson("{\"name\": \"" + name + "\"}", Employee.class);
        System.out.println(employee.getName());
    }

    static class Employee {
        public String name;

        public String getName() {
            return this.name;
        }
    }
}
