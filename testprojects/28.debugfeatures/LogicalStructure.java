import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class LogicalStructure {

    public static void main(String[] args) {
        int[] arrays = new int[] { 1 };
        Object obj = new Object();
        Map<String, String> emptyMap = new HashMap<>();
        Map<String, Integer> bookset = new LinkedHashMap<>();
        bookset.put("Algorithm Introduction", 60);
        bookset.put("Thinking in JAVA", 50);

        Map<String, Map<String, Integer>> bigStore = new HashMap<>();
        for (int i = 0; i < 100000; i++) {
            bigStore.put("key" + i, bookset);
        }

        List<String> emptyList = new ArrayList<>();
        List<Foo> list = Arrays.asList(new Foo("One"), new Foo("Two"));
        List<String> bigList = new ArrayList<>();
        for (int i = 0; i < 100000; i++) {
            bigList.add("key" + i);
        }

        System.out.println("Exit.");
    }

    static class Foo {
        private String name;

        Foo(String name) {
            this.name = name;
        }
    }
}
