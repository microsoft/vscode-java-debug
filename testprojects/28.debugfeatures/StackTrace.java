public class StackTrace {

    public static void main(String[] args) {
        System.out.println("begin.");
        new RuntimeException("test").printStackTrace();

        System.out.println("finish.");
        new RuntimeException("test1").printStackTrace(System.out);

        System.out.println("exit");
        throw new RuntimeException("test2");
    }
}
