import java.io.File;

public class CustomClassLoaderTest {
    public static void main(String[] args) {
        File replacement = new File(new File("").getAbsolutePath(), "replacement");
        if (!replacement.exists()) {
            replacement = new File(new File("").getAbsolutePath(), "../replacement");
        }


        final String replacementFolder = replacement.getAbsolutePath();
        new Thread(()-> {
            try {
                System.out.println("Using " + replacementFolder);
                CustomCL cl = new CustomCL(replacementFolder);
                Class cls = cl.loadClass("Foo");

                IFoo foo = (IFoo)cls.newInstance();
                new Foo().sayHello();
                foo.sayHello();
            } catch(Exception ex) {
                ex.printStackTrace();
            }
        }).start();
    }
}