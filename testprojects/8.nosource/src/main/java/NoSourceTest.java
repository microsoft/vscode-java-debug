public class NoSourceTest {
    public static void main(String[] args) throws Exception {
        new test.Foo().bar(1,2, i-> {
            System.out.println(i+10);
        });
    }
}