# Contributing to Java Debugger

## Build and Debug

### Getting the source
This debugger is written in [TypeScript](https://github.com/Microsoft/TypeScript), and it depends on a [Java Debug Server](https://github.com/Microsoft/java-debug) written in Java.
- Suggest to create a new folder first.
  ```bash
  mkdir javaDebugger
  cd javaDebugger
  ```
- Check out source code for the extension.
  ```bash
  git clone https://github.com/Microsoft/vscode-java-debug.git
  ```
- Check out source code for the debug server.
  ```bash
  git clone https://github.com/Microsoft/java-debug.git
  ```
Now the folder structure looks like following:
```bash
javaDebugger/
├── java-debug
└── vscode-java-debug
```

### Prerequisites
- [JDK](http://www.oracle.com/technetwork/java/javase/downloads/index.html), (version 1.8.0 or later)
- [VS Code](https://code.visualstudio.com/), (version 1.19.0 or later)
- [Node.JS](https://nodejs.org/en/), (>= 8.9.1, < 9.0.0)
- [Language Support for Java by Red Hat](https://marketplace.visualstudio.com/items?itemName=redhat.java), (version 0.14.0 or later)

Install all the dependencies using `npm` (supposed to be installed together with [Node.JS](https://nodejs.org/en/)).
```bash
cd vscode-java-debug
npm install
```

### Build and Run
#### Build the Debug Server
For convenience, there is task `build_server` defined in `gulpfile.js`. It builds the Java Debug Server and then copies the .jar file into folder `vscode-java-debug/server`.
```bash
npx gulp build_server
```
**NOTE**: If you didn't follow the steps to check out [vscode-java-debug](https://github.com/Microsoft/vscode-java-debug) and [java-debug](https://github.com/Microsoft/java-debug) in the same folder, please specify a correct `server_dir` in your [gulpfile.js](https://github.com/Microsoft/vscode-java-debug/blob/master/gulpfile.js#L5).

#### Debug the Extension
Open folder `vscode-java-debug` in VS Code, or simply execute following commands if you have `code` in your system PATH.
```bash
cd vscode-java-debug
code .
```
Press <kbd>F5</kbd> to start debugging the extension, it will create a new window as the extension host.

#### Debug the Debug Server
When you are debugging the extension, it is able to debug the Java process with local port `1044`. To remote debug the server, you can attach a Java debugger to `localhost:1044` using an IDE (Eclipse, IntelliJ IDEA, etc) or the Java Debugger for VS Code itself.

Since we have checked in a valid [launch.json](https://github.com/Microsoft/java-debug/blob/master/.vscode/launch.json) to the repository, it would be easy to use the Java Debugger for VS Code itself to debug the server.
- Open folder `java-debug` in a new window in VS Code.
- Press <kbd>F5</kbd> to attach.

## Pull Requests
Before we can accept a pull request from you, you'll need to sign a [Contributor License Agreement (CLA)](https://github.com/Microsoft/vscode/wiki/Contributor-License-Agreement). It is an automated process and you only need to do it once.
To enable us to quickly review and accept your pull requests, always create one pull request per issue and [link the issue in the pull request](https://github.com/blog/957-introducing-issue-mentions). 