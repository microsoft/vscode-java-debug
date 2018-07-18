package com.microsoft.debug;


public class HelloWorld {
    static class InnerType {
        public static void print() {
            System.out.println("Inner Type.");
        }
    }

    private static int value = 0;

    public static void main(String[] args) throws Exception {
        new Thread() {
            public void run() {
                while (true) {
                    try {
                        Thread.sleep(500);

                        System.out.println("thread 1");

                        Person person = new Person("c4");
                        System.out.println(person.getName());
                        person.toString();
                    } catch (InterruptedException e) {
                    }
                }
            }
        }.start();

        
        new Thread() {
            public void run() {
                while (true) {
                    try {
                        Thread.sleep(500);

                        System.out.println("thread 2");

                        Person person = new Person("c4");
                        System.out.println(person.getName());
                        person.toString();
                    } catch (InterruptedException e) {
                    }
                }
            }
        }.start();

        change();
        while (true) {
            try {
                Thread.sleep(1000);
            } catch (InterruptedException  e) {
                
            }
        }
    }

    public static void change() {
        value++;
        System.out.println(value);
    }

}
