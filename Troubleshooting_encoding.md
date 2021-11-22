# Troubleshooting Guide for Encoding Issues

This document provides a guide mostly for Windows users to solve common Java encoding issues.

## 1. Background
Computers can only understand the binary data such as 0 and 1, and it uses charset to encode/decode the data into real-world characters. When two processes interact with each other for I/O, they have to use the compatible charset for encoding and decoding, otherwise garbled characters will probably appear. macOS and Linux use UTF-8 everywhere and encoding is not a problem for them. For Windows, however, the default charset is not UTF-8 and is platform-dependent, which can lead to inconsistent encoding between different tools. 

## 2. Common Problems
Below are the typical encoding problems when running a Java program on Windows terminal.

2.1) The file or directory name contains unicode characters, Java launcher cannot find the corresponding classpath or main class well.
```
C:\Test>java -cp 中文目录 Hello
Error: Could not find or load main class Hello
```

```
C:\Test>java -cp ./Exercises 练习
Error: Could not find or load main class ??
Caused by: java.lang.ClassNotFoundException: ??
```

2.2) The string literals with unicode characters appear garbled when printed to the terminal.
```java
public class Hello {
    public static void main(String[] args) {
        System.out.println("你好！");
    }
}
```

```
C:\Test>java -cp ./Exercises Hello
??!
```

2.3) Garbled characters when Java program interacts with terminal for I/O.

```java
import java.util.Scanner;

public class Hello {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        System.out.println(scanner.nextLine());
    }
}
```

```
C:\Test>chcp
65001

C:\Test>java -Dfile.encoding=UTF-8 -cp ./Exercises Hello
你好
��
```

## 3.Troubleshooting Suggestions
The following diagram shows the parts of encoding that may be involved when writing and running Java in VS Code.
<p align="center">
  <img alt="encoding_diagram" src="https://user-images.githubusercontent.com/14052197/142844414-360765c9-8e7d-4825-a5b9-7360c624fa8d.png">
  <br>
    <em>Encoding on Windows</em>
</p>

- During the compilation phase, VS Code Java extension uses the file encoding from VS Code settings to read .java source files and compile .class files. Encoding is consistent between editor and Java extension.

- During the run/debug phase, Java extension launches the application in the terminal by default. Most encoding problems occur because the terminal and JVM use incompatible charsets for data processing, or use charsets that do not support the target unicode characters.
  - <b>JVM</b> - Uses a default charset compatible with the system locale of Windows platform, and you can change it by using the JVM argument `"-Dfile.encoding"`, or by using `"encoding"` setting in launch.json when running through Java debugger extension.
  - <b>Windows Terminals</b> - Uses code page to handle encoding, and you can use `"chcp"` command to view and change the code page.

To solve the encoding problems, the straightforward idea is to use UTF-8 in all toolchains. But unfortunately Windows terminals (such as cmd) do not support UTF-8 perfectly. Therefore, the alternative idea is to let the terminal and JVM use compatible character sets for data processing.

### 3.1) Fix Suggestion : Change system locale to the target language.

On Windows, when you change the system locale, the default Java charset will be changed to one compatible with the system locale, and the terminal's (e.g. cmd) code page will be automatically updated to be consistent as well. Therefore, changing system locale to the target language can solve most encoding issues on Windows. This is also suggested by Java site https://www.java.com/en/download/help/locale.html.

The following screenshot shows how to change the system locale in Windows. for example, if I want to use a terminal to enter Chinese characters into a Java program, I can set the Windows system locale to Chinese. The default Java charset will be `"GBK"` and the cmd codepage will be `"936"`, which will support Chinese characters nicely.
<p align="center">
  <img alt="change_system_locale" src="https://user-images.githubusercontent.com/14052197/138408027-da71d3f4-7f64-4bfb-8b34-89d0605606f5.png">
  <br>
    <em>Change System Locale</em>
</p>
