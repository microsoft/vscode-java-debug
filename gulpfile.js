const gulp = require("gulp");
const cp = require('child_process');
const tslint = require("gulp-tslint");
const copy = require("gulp-copy");

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
		.pipe(copy('./server', {
			prefix: 4
		}))
		.pipe(gulp.dest('.'));
});

function mvnw() {
	return "mvn";
}