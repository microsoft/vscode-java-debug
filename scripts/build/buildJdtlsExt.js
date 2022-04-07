// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

const cp = require('child_process');
const path = require('path');
const fs = require('fs');

const server_dir = path.resolve('../java-debug');

cp.execSync(mvnw() + ' clean package', {
    cwd: server_dir,
    stdio: [0, 1, 2]
});
copy(path.join(server_dir, 'com.microsoft.java.debug.plugin/target'), path.resolve('server'), (file) => {
    return /^com.microsoft.java.debug.*.jar$/.test(file);
});

function copy(sourceFolder, targetFolder, fileFilter) {
    const jars = fs.readdirSync(sourceFolder).filter(file => fileFilter(file));
    if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder);
    }
    for (const jar of jars) {
        fs.copyFileSync(path.join(sourceFolder, jar), path.join(targetFolder, path.basename(jar)));
    }
}

function isWin() {
	return /^win/.test(process.platform);
}

function isMac() {
	return /^darwin/.test(process.platform);
}

function isLinux() {
	return /^linux/.test(process.platform);
}

function mvnw() {
	return isWin() ? "mvnw.cmd" : "./mvnw";
}
