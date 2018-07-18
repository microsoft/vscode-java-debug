import java.util.Arrays;
import java.util.List;

public class JdkVersion {
	public static void main(String[] args) {
		String jdkVersion = System.getProperty("java.version");

		List<Integer> nums = Arrays.asList(1, 2, 3, 4);
		float squareNums = nums.stream().map(n -> n * n).reduce((sum, n) -> sum + n).get().floatValue();
		System.out.println(jdkVersion);
		System.out.println(squareNums);
	}
}