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
- [JDK](http://www.oracle.com/technetwork/java/javase/downloads/index.html), (version 11 or later)
- [VS Code](https://code.visualstudio.com/), (version 1.44.0 or later)
- [Node.JS](https://nodejs.org/en/), (20.x or 22+)
- [Language Support for Java by Red Hat](https://marketplace.visualstudio.com/items?itemName=redhat.java), (version 0.60.0 or later)

Install all the dependencies using `npm` (supposed to be installed together with [Node.JS](https://nodejs.org/en/)).
```bash
cd vscode-java-debug
npm install
```

### Build and Run
#### Build the Debug Server
For convenience, there is a build script `buildJdtlsExt.js` defined in `scripts/build`. It builds the Java Debug Server and then copies the .jar file into folder `vscode-java-debug/server`.
```bash
npm run build-server
```
**NOTE**: If you didn't follow the steps to check out [vscode-java-debug](https://github.com/Microsoft/vscode-java-debug) and [java-debug](https://github.com/Microsoft/java-debug) in the same folder, please specify a correct `server_dir` in your [buildJdtlsExt.js](https://github.com/Microsoft/vscode-java-debug/blob/master/scripts/build/buildJdtlsExt.js#L8).

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

## Team-memory workflow setup

`.github/workflows/team-memory-post-merge.yml` queues requests to
[`team-memory-coordinator.yml` in Java Pack](https://github.com/microsoft/vscode-java-pack/actions/workflows/team-memory-coordinator.yml)
on its `main` branch. The coordinator serializes shared-wiki maintenance and owns
agent invocation, source validation, and final receipt validation. This source
workflow does not invoke the agent or write the wiki.

Automatic requests retain the existing source variable
`ISSUELENS_TEAM_MEMORY_ENABLED == 'true'`. Only ordinary pushes to this
repository's default branch (`main`) qualify: the workflow revision must match
the pushed commit, and branch creation, deletion, and forced pushes are excluded.
Keep the source workflow path unchanged because coordinator validation checks it.

Before merging this migration with the existing opt-in enabled, configure these
new caller credentials in `microsoft/vscode-java-debug`:

| Setting | Purpose |
| --- | --- |
| Variable `ISSUELENS_DISPATCH_APP_CLIENT_ID` | Client ID of a dedicated dispatch GitHub App. |
| Secret `ISSUELENS_DISPATCH_APP_PRIVATE_KEY` | Private key of that dispatch App. |

Install the dispatch App only on `microsoft/vscode-java-pack`, with **Contents:
read** and **Actions: write**. The workflow requests an installation token scoped
to that repository and those permissions; token revocation remains enabled.
The source `GITHUB_TOKEN` cannot dispatch across repositories. Do not reuse the
hosted IssueLens App key or the coordinator's separate source-read credentials.
Merging switches enabled source runs to queue dispatch, so missing caller
credentials fail the run rather than falling back to direct invocation.

External maintenance also requires Java Pack's existing coordinator opt-in and
its separate `ISSUELENS_SOURCE_READ_APP_CLIENT_ID` and
`ISSUELENS_SOURCE_READ_APP_PRIVATE_KEY` secrets. That App must have **Actions:
read**, **Contents: read**, and **Pull requests: read** access to this allowlisted
source. A successful Java Pack own-repository run does not verify external-source
authentication. These are rollout prerequisites; this change does not configure
Apps, credentials, or live variables.

The request contains five string fields: `source_repository`, `source_run_id`,
`source_run_attempt`, `push_before`, and `push_after`. The coordinator verifies the
source run and head SHA; `push_before` is an authorized reconciliation ancestor,
not attested original-event provenance. Dispatch acceptance confirms neither
coordinator completion nor a wiki update. Inspect coordinator runs before
retrying a failed or uncertain dispatch; the dispatcher does not retry.
For manual merged-PR maintenance, use **Run workflow** in the central coordinator
with `source_repository=microsoft/vscode-java-debug` and `pull_request_number`.
There is no local manual path that bypasses the queue.
