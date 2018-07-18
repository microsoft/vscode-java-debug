public class RecursiveTest {
    public static void main(String[] args) {
    	testRecursion(1000);
    }

    public static int testRecursion(int number) {
        if (number == 1) {
            return 1;
        } else {
            int result = 1 + testRecursion(number - 1);
            return result;
        }
    }
}