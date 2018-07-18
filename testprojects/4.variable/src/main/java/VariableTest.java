import java.lang.reflect.Array;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@SuppressWarnings("unused")
public class VariableTest extends Foo {
    private static int x = 100;

    @SuppressWarnings("unchecked")
    public static <T> T[] createArray(Class<T> type, int size) {
        return (T[]) Array.newInstance(type, size);
    }

    private int i = 19099;
    @SuppressWarnings({ "rawtypes", "unchecked" })
    public void test() {
        int[] arrays = new int[] { 1 };
        int i = 100;
        i += 10;
        String nullstr = null;
        String str = "string test";
        for (int l = 0; l < 1000; l++) {
            str += "a";
        }
        Object obj = new Object();
        Object test = new VariableTest();
        Object a = new A();
        Class b = A.class;
        int[] intarray = new int[] { 1, 2, 3 };
        List<String> strList = new ArrayList<>();
        strList.add(str);
        strList.add(null);
        Map<String, Integer> map = new HashMap<String, Integer>();
        String[] t = new String[] { "hello" };

        String[][] genericArray = createArray((Class<String[]>) t.getClass(), 10);
        String[][][] multi = new String[5][10][32];
        genericArray[0] = t;
        map.put("a", 1);
        i++;
        ArrayList<Integer>[] d = new ArrayList[0];
        System.out.println(d.length);

        GenericsFoo<Foo> dd = new GenericsFoo<Foo>(new Foo());
        ArrayList<int[]> list = new ArrayList<>();
        list.add(new int[] { 1 });
        i++;
    }

    public static void main(String[] args) {
        new VariableTest().test();
    }
}


@SuppressWarnings("unused")
interface BBB {
    static void test() {
        int j = 0;
        j++;
    }
}

class BaseA {

    class BBB {
    }

    int baseI = 10;
}

class A {
    class BB {
        public void test() {
            A.this.new BB();
        }

        class CC {
            class DD {

            }
        }
    }
}
@SuppressWarnings("unused")
class Foo {
    private int x;
}

class GenericsFoo<G extends Foo> {
    private G x;

    public GenericsFoo(G x) {
        this.x = x;
    }

    public G getX() {
        return x;
    }

    public void setX(G x) {
        this.x = x;
    }
}