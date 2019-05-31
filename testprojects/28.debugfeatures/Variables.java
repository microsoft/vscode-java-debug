import java.util.*;

public class Variables {

    public static void main(String[] args) {
        int[] a = new int[100000];
        Integer intObj = new Integer(20);
        Float floatObj = new Float("1.354");
        Character character = new Character('a');
        Boolean bool = new Boolean(true);

        Map<String, String> emptyMap = new HashMap<>();
        Map<String, Integer> bookset = new LinkedHashMap<>();
        bookset.put("Algorithm Introduction", 60);
        bookset.put("Thinking in JAVA", 50);

        Map<String, Map<String, Integer>> smallStore = new HashMap<>();
        smallStore.put("Computer Science", bookset);

        Map<String, Map<String, Integer>> bigStore = new HashMap<>();
        for (int i = 0; i < 100000; i++) {
            bigStore.put("key" + i, bookset);
        }

        List<String> smallList = Arrays.asList("Algorithm Introduction");
        List<String> bigList = new ArrayList<>();
        for (int i = 0; i < 100000; i++) {
            bigList.add("key" + i);
        }

        School school = new School();
        Person person = new Person();
        Person person1 = null;
        Employee employee = new Employee();
        StringException stringException = new StringException();
        NullString nullString =new NullString();
        Date date = new Date();
        String name = "Test";
        System.out.println("Exit.");
    }

    public static class School {
        String name = "test";

    }

    public static class Person {
        String name = "jinbo";

        @Override
        public String toString() {
            return "Person [name=" + name + "]";
        }
    }

    public static class Employee extends Person {

    }

    public static class StringException {

        @Override
        public String toString() {
            throw new RuntimeException("Unimplemented method exception");
        }
    }

    public static class NullString {

        @Override
        public String toString() {
            return null;
        }
    }
}
