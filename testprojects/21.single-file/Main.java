public class Main{
    public static void main(String[] args) {
        String s = "1";
        char sr = 'c';
        int t = 1;
        t++;
        test(t);
    }

    private static void test(int t) {
        int s = 1;
        System.out.println("test" + s + t);
    }
}