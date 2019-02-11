package test;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

    public class ArgsTest {

        public static void main(String[] args) throws IOException {

            List<String> proList=Arrays.asList(args);

            String sysProp1Value = System.getProperty("sysProp1");
            String sysProp2Value  = System.getProperty("sysProp2");
            List<String> vmList=new ArrayList<>();
            vmList.add(sysProp1Value );
            vmList.add(sysProp2Value );
            String encoding=System.getProperty("file.encoding");
            System.out.println("Program Arguments:"+String.join(" ", proList)+" VM Arguments:"+String.join(" ",vmList));

        }
    }