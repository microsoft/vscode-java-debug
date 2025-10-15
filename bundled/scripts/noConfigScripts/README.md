# Java No-Config Debug

This feature enables configuration-less debugging for Java applications, similar to the JavaScript Debug Terminal in VS Code.

## How It Works

When you open a terminal in VS Code with this extension installed, the following environment variables are automatically set:

- `VSCODE_JDWP_ADAPTER_ENDPOINTS`: Path to a communication file for port exchange
- `PATH`: Includes the `javadebug` command wrapper

Note: `JAVA_TOOL_OPTIONS` is NOT set globally to avoid affecting other Java tools (javac, maven, gradle). Instead, it's set only when you run the `javadebug` command.

## Usage

### Basic Usage

Instead of running:
```bash
java -cp . com.example.Main
```

Simply run:
```bash
javadebug -cp . com.example.Main
```

The debugger will automatically attach, and breakpoints will work without any launch.json configuration!

### Maven Projects

```bash
javadebug -jar target/myapp.jar
```

### Gradle Projects

```bash
javadebug -jar build/libs/myapp.jar
```

### With Arguments

```bash
javadebug -cp . com.example.Main arg1 arg2 --flag=value
```

### Spring Boot

```bash
javadebug -jar myapp.jar --spring.profiles.active=dev
```

## Advantages

1. **No Configuration Required**: No need to create or maintain launch.json
2. **Rapid Prototyping**: Perfect for quick debugging sessions
3. **Script Debugging**: Debug applications launched by complex shell scripts
4. **Environment Consistency**: Inherits all terminal environment variables
5. **Parameter Flexibility**: Easy to change arguments using terminal history (↑ key)

## How It Works Internally

1. When you run `javadebug`, the wrapper script temporarily sets `JAVA_TOOL_OPTIONS=-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=0`
2. The wrapper launches the Java process with JDWP enabled
3. JVM starts and outputs: "Listening for transport dt_socket at address: 12345"
4. The wrapper captures the JDWP port from this output
5. The port is written to a communication file
6. VS Code's file watcher detects the file and automatically starts an attach debug session

## Troubleshooting

### Port Already in Use

If you see "Address already in use", another Java debug session is running. Terminate it first.

### No Breakpoints Hit

1. Ensure you're running with `javadebug` command (not plain `java`)
2. Check that the `javadebug` command is available: `which javadebug` (Unix) or `Get-Command javadebug` (PowerShell)
3. Verify the terminal was opened AFTER the extension activated
4. Check the Debug Console for error messages

### Node.js Not Found

The wrapper script requires Node.js to be installed and available in PATH.

## Limitations

- Requires Node.js to be installed and available in PATH
- Only works in terminals opened within VS Code
- Requires using the `javadebug` command instead of `java`
- The Java process will suspend (hang) until the debugger attaches

## See Also

- [Debugger for Java Documentation](https://github.com/microsoft/vscode-java-debug)
- [JDWP Documentation](https://docs.oracle.com/javase/8/docs/technotes/guides/jpda/jdwp-spec.html)
