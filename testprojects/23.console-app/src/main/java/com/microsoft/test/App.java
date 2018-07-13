package com.microsoft.test;

import java.util.Scanner;

public class App 
{
    public static void main( String[] args )
    {
        System.out.println("Please input your name:");
        
        Scanner in = new Scanner(System.in);
        String name = in.nextLine();

        System.out.println("Thanks, " + name);
    }
}
