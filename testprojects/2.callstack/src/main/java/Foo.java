public class Foo {
    private Bar bar = new Bar();

    public void testFoo(int j) {
        System.out.println("This is test method in foo.");
        bar.testBar(j + 10);
    }

}
