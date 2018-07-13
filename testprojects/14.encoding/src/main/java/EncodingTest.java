import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.nio.charset.Charset;

public class EncodingTest {
    public static void main(String[] args) throws Exception {
        String var = "abcÖÐÎÄdef";
        System.out.println(var);
        System.out.println(var.length());
        System.out.println("Default Charset=" + Charset.defaultCharset());
        System.out.println("file.encoding=" + System.getProperty("file.encoding"));
        System.out.println("Default Charset in Use=" + getDefaultCharSet());
    }

    private static String getDefaultCharSet() {
        try (OutputStreamWriter writer = new OutputStreamWriter(new ByteArrayOutputStream())) {
            return writer.getEncoding();
        } catch (IOException ex) {
            ex.printStackTrace();
            return "exception";
        }

    }
}