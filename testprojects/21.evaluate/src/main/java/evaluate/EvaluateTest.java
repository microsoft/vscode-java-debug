package evaluate;

public class EvaluateTest {
	public static void main(String[] args) {
		int i = 0;
		i++;
		int test1 = new EvaluateTest().test();
		System.out.print(test1 + i);
	}

	public static int test() {
		return 3;
	}
}
