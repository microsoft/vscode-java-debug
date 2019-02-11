public class EnvrionmentVariable {
    public static void main(String[] args) {
        String customEnv = System.getenv("CUSTOM_ENV_FOR_TEST_PLAN");
        String systemPath = System.getenv("PATH");
        System.out.println(String.format("CustomEnv: %s", customEnv));
        System.out.println(String.format("SystemPath: %s", systemPath));
    }
}