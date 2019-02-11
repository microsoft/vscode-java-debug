package test;
import java.util.stream.Stream;

public class attachdebug {
	public static void main(String[] args) {
		String concat = Stream.of("A", "B", "C", "D").reduce("", String::concat);
		Integer[] sixNums = {1, 2, 3, 4, 5, 6};
		int evens =
		Stream.of(sixNums).filter(n -> n%2 == 0).reduce(0, Integer::sum);
		
		System.out.println(concat+"  "+evens);
	}

}
