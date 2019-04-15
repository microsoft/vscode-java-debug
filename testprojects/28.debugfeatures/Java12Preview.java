public class Java12Preview {

    public static void main(String[] args) {
        String week = "MONDAY";
        switch (week) {
            case "MONDAY" -> {
                System.out.println("This is Monday");
            }
            case "TUESDAY" -> System.out.println("This is TUESDAY");
            default -> System.out.println("Unknown day.");
        }
    }
}