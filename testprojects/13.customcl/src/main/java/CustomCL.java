import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Paths;

class CustomCL extends ClassLoader {
    private String baseFolder;

    public CustomCL(String baseFolder) {
        super(null);
        this.baseFolder = baseFolder;
    }

    @Override
    protected Class<?> findClass(String name) throws ClassNotFoundException {
        // load from parent
        Class<?> result = findLoadedClass(name);
        if (result != null) {
            return result;
        }

        try {
            File classFile = new File(baseFolder, name + ".class");
            if (classFile.exists()) {
                byte[] bytes = Files.readAllBytes(Paths.get(classFile.getAbsolutePath()));
                return defineClass(name, bytes, 0, bytes.length);
            }
        } catch (IOException e) {
            e.printStackTrace();
        }
        return getSystemClassLoader().loadClass(name);

    }

    @Override
    protected Class loadClass(String name, boolean resolve)
        throws ClassNotFoundException {
        Class cls;

        cls = findLoadedClass(name);
        if (cls == null) {
            cls = findClass(name);
        }

        if (cls == null) {
            throw new ClassNotFoundException(name);
        }

        if (resolve)
            resolveClass(cls);
        return cls;
    }

}