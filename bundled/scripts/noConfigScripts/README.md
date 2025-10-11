# Java No-Config Debug

This feature enables configuration-less debugging for Java applications, similar to the JavaScript Debug Terminal in VS Code.

## How It Works

When you open a terminal in VS Code with this extension installed, the following environment variables are automatically set:

- `JAVA_TOOL_OPTIONS`: Configured with JDWP to enable debugging on a random port
- `VSCODE_JDWP_ADAPTER_ENDPOINTS`: Path to a communication file for port exchange
- `PATH`: Includes the `javadebug` command wrapper

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

1. The extension sets `JAVA_TOOL_OPTIONS=-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=0,quiet=y`
2. When you run `javadebug`, it wraps the Java process
3. The wrapper captures the JDWP port from JVM output: "Listening for transport dt_socket at address: 12345"
4. The port is written to a communication file
5. VS Code's file watcher detects the file and automatically starts an attach debug session

## Troubleshooting

### Port Already in Use

If you see "Address already in use", another Java debug session is running. Terminate it first.

### No Breakpoints Hit

1. Ensure you're running with `javadebug` command
2. Check that JAVA_TOOL_OPTIONS is set in your terminal
3. Verify the terminal was opened AFTER the extension activated

### Node.js Not Found

The wrapper script requires Node.js to be installed and available in PATH.

## Limitations

- Requires Node.js to be installed
- Only works in terminals opened within VS Code
- Cannot debug applications that override JAVA_TOOL_OPTIONS

## See Also

- [Debugger for Java Documentation](https://github.com/microsoft/vscode-java-debug)
- [JDWP Documentation](https://docs.oracle.com/javase/8/docs/technotes/guides/jpda/jdwp-spec.html)
