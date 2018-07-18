import java.util.concurrent.atomic.AtomicInteger;

public class ThreadTest {
    public static void main(String[] args) throws Exception {        
        Object object = new Object();
        AtomicInteger ai = new AtomicInteger();
        Thread thread1 = new Thread(() -> {
            for (;;) {
                try {
                    synchronized(object) {
                        object.wait();
                    }
                    System.out.println(String.format("Print %d in %d" , ai.incrementAndGet(), Thread.currentThread().getId()));
                } catch (InterruptedException e) {
                    e.printStackTrace();
                    break;
                }
            }
        });
        Thread thread2 = new Thread(() -> {
            for (;;) {
                System.out.println(String.format("Print %d in %d" , ai.incrementAndGet(), Thread.currentThread().getId()));
                synchronized(object) {
                    object.notify();
                }
                try {
                    Thread.sleep(1000);
                } catch (InterruptedException e) {
                    e.printStackTrace();
                    break;
                }
            }
        });
        thread1.start();
        thread2.start();
        thread1.join();
        thread2.join();
    }
}