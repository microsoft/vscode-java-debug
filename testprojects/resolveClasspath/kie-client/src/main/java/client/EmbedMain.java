package client;

import java.net.URL;
import java.net.URLClassLoader;

import org.kie.api.KieServices;
import org.kie.api.runtime.KieContainer;
import org.kie.dmn.api.core.DMNContext;
import org.kie.dmn.api.core.DMNModel;
import org.kie.dmn.api.core.DMNResult;
import org.kie.dmn.api.core.DMNRuntime;

/**
 * EmbedMain
 */
public class EmbedMain {

    public static void main(String[] args) {
        try {
            Class.forName("org.drools.compiler.commons.jci.readers.ResourceReader");
        } catch (ClassNotFoundException e) {
            e.printStackTrace();
        }
        ClassLoader cl = EmbedMain.class.getClassLoader();

        URL[] urls = ((URLClassLoader) cl).getURLs();

        for (URL url : urls) {
            System.out.println(url.getFile());
        }

        KieServices kieServices = KieServices.Factory.get();

        KieContainer kieContainer = kieServices.getKieClasspathContainer();

        DMNRuntime dmnRuntime = kieContainer.newKieSession().getKieRuntime(DMNRuntime.class);

        DMNContext dmnContext = dmnRuntime.newContext();

        dmnContext.set("PreviousIncidents", false);
        dmnContext.set("Age", 28);
        dmnContext.set("CarAge", 3);

        String namespace = "http://www.trisotech.com/definitions/_bb8b9304-b29f-462e-9f88-03d0d868aec5";
        String modelName = "Insurance Pricing";

        DMNModel dmnModel = dmnRuntime.getModel(namespace, modelName);

        DMNResult dmnResult = dmnRuntime.evaluateAll(dmnModel, dmnContext);

        System.out.println(dmnResult);
    }
}