# Testing Java No-Config Debug

## Quick Test

1. **Create a simple Java file** (`HelloWorld.java`):

```java
public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Starting application...");
        
        String message = "Hello, World!";
        System.out.println(message); // Set a breakpoint here
        
        for (int i = 0; i < 3; i++) {
            System.out.println("Count: " + i);
        }
        
        System.out.println("Application finished.");
    }
}
```

2. **Compile it**:
```bash
javac HelloWorld.java
```

3. **Set a breakpoint** on the line with `System.out.println(message);`

4. **Run with javadebug**:
```bash
javadebug HelloWorld
```

5. **Result**: 
   - The debugger should automatically attach
   - Execution should pause at your breakpoint
   - You can inspect variables, step through code, etc.

## Advanced Test - With Arguments

Create `EchoArgs.java`:

```java
public class EchoArgs {
    public static void main(String[] args) {
        System.out.println("Arguments received: " + args.length);
        
        for (int i = 0; i < args.length; i++) {
            System.out.println("Arg " + i + ": " + args[i]); // Breakpoint here
        }
    }
}
```

Compile and run:
```bash
javac EchoArgs.java
javadebug EchoArgs arg1 arg2 "arg with spaces"
```

## Test with JAR

Create a JAR with manifest:

```bash
# Compile
javac HelloWorld.java

# Create manifest
echo "Main-Class: HelloWorld" > manifest.txt

# Create JAR
jar cfm hello.jar manifest.txt HelloWorld.class

# Debug the JAR
javadebug -jar hello.jar
```

## Test Terminal History

One of the key benefits is easy parameter modification:

```bash
# First run
javadebug EchoArgs test1 test2

# Press ↑ to recall, modify and run again
javadebug EchoArgs different parameters

# Press ↑ again, modify again
javadebug EchoArgs yet another test
```

This is much faster than editing launch.json each time!

## Verify Environment Variables

In your VS Code terminal, check that environment variables are set:

**Unix/Linux/macOS**:
```bash
echo $JAVA_TOOL_OPTIONS
echo $VSCODE_JDWP_ADAPTER_ENDPOINTS
which javadebug
```

**Windows (PowerShell)**:
```powershell
$env:JAVA_TOOL_OPTIONS
$env:VSCODE_JDWP_ADAPTER_ENDPOINTS
Get-Command javadebug
```

**Windows (CMD)**:
```cmd
echo %JAVA_TOOL_OPTIONS%
echo %VSCODE_JDWP_ADAPTER_ENDPOINTS%
where javadebug
```

## Expected Output

When you run `javadebug`, you should see something like:

```
Picked up JAVA_TOOL_OPTIONS: -agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=0,quiet=y
[Java Debug] Captured JDWP port: 54321
[Java Debug] Wrote endpoint file: C:\...\endpoint-abc123.txt
Starting application...
```

Then VS Code should show:
- Debug toolbar appears
- Breakpoint icon turns solid red (was hollow)
- Execution pauses at your breakpoint

## Common Issues

### Issue: "javadebug: command not found"

**Solution**: 
- Close and reopen your terminal
- The extension must be activated first
- Check that the extension is installed and enabled

### Issue: Debugger doesn't attach

**Solution**:
- Check the Debug Console for errors
- Verify JAVA_TOOL_OPTIONS is set
- Try setting a breakpoint before running

### Issue: "Address already in use"

**Solution**:
- Stop any existing debug sessions
- Wait a few seconds and try again
- The port from a previous session might still be bound

## Comparison with Traditional Debugging

### Traditional Way (with launch.json):

1. Create `.vscode/launch.json`
2. Configure:
```json
{
    "type": "java",
    "name": "Debug HelloWorld",
    "request": "launch",
    "mainClass": "HelloWorld",
    "args": ["arg1", "arg2"]
}
```
3. Press F5
4. To change args: Edit launch.json, save, press F5

### No-Config Way:

1. Set breakpoint
2. Run: `javadebug HelloWorld arg1 arg2`
3. To change args: Press ↑, edit command, press Enter

**Much faster! 🚀**
