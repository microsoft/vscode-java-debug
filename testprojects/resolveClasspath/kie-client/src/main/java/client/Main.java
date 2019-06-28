package client;

import java.util.Map;

import org.kie.dmn.api.core.DMNContext;
import org.kie.dmn.api.core.DMNResult;
import org.kie.server.api.model.ServiceResponse;
import org.kie.server.client.DMNServicesClient;
import org.kie.server.client.KieServicesClient;
import org.kie.server.client.KieServicesConfiguration;
import org.kie.server.client.KieServicesFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class Main {

	final static Logger log = LoggerFactory.getLogger(Main.class);

	private static final String URL = "http://localhost:8080/kie-server/services/rest/server";
	private static final String user = System.getProperty("username", "donato");
	private static final String password = System.getProperty("password", "donato");
	private static final String CONTAINER = "InsuranceDecision_1.0-SNAPSHOT";

	public static void main(String[] args) {
		Main clientApp = new Main();

		long start = System.currentTimeMillis();
		
		clientApp.evaluateDMN();

		long end = System.currentTimeMillis();
		System.out.println("elapsed time: " + (end - start));
	}

	private void evaluateDMN() {
		KieServicesClient client = getClient();
		DMNServicesClient dmnClient = client.getServicesClient(DMNServicesClient.class);

		String namespace = "http://www.trisotech.com/definitions/_bb8b9304-b29f-462e-9f88-03d0d868aec5";
		String modelName = "Insurance Pricing";

		DMNContext dmnContext = dmnClient.newContext();

		dmnContext.set("PreviousIncidents", false);
		dmnContext.set("Age", 28);
		dmnContext.set("CarAge", 3);

		ServiceResponse<DMNResult> result = dmnClient.evaluateAll(CONTAINER, namespace, modelName, dmnContext);
		System.out.println(result);
		
	}

	private KieServicesClient getClient() {
		KieServicesConfiguration config = KieServicesFactory.newRestConfiguration(URL, user, password);

		// Configuration for JMS
		//		KieServicesConfiguration config = KieServicesFactory.newJMSConfiguration(connectionFactory, requestQueue, responseQueue, username, password)
		
		Map<String, String> headers = null;
		config.setHeaders(headers);
		KieServicesClient client = KieServicesFactory.newKieServicesClient(config);

		return client;
	}

}
