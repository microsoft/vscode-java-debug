public class HelloWorld {
    public static void main(String[] args) {
        System.out.print("hello");
        if (args != null && args.length > 0) {
            for (String arg : args) {
                System.out.print(" " + arg);
            }
            System.out.println();
        } else {
            System.out.println(" world");
        }        
    }
}