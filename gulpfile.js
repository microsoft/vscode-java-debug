const gulp = require("gulp");
const cp = require('child_process');
const tslint = require("gulp-tslint");

const server_dir = '../java-debug';

gulp.task("tslint", () => {
	return gulp.src(["**/*.ts", "!**/*.d.ts", "!node_modules/**", "!./src/views/node_modules/**"])
		.pipe(tslint())
		.pipe(tslint.report());
});

gulp.task('build_server', () => {
	cp.execSync(mvnw() + ' clean package', {
		cwd: server_dir,
		stdio: [0, 1, 2]
	});
	gulp.src(server_dir + '/com.microsoft.java.debug.plugin/target/com.microsoft.java.debug.*.jar')
		.pipe(gulp.dest('./server'));
});

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
	return isWin()?"mvnw.cmd":"./mvnw";
}
