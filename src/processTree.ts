/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  Copied from https://github.com/microsoft/vscode-node-debug/blob/master/src/node/extension/processTree.ts
 *--------------------------------------------------------------------------------------------*/
/* tslint:disable */
'use strict';

import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { join } from 'path';

export class ProcessTreeNode {
	children?: ProcessTreeNode[];

	constructor(public pid: number, public ppid: number, public command: string, public args: string) {
	}
}

export async function getProcessTree(rootPid: number) : Promise<ProcessTreeNode | undefined> {

	const map = new Map<number, ProcessTreeNode>();

	map.set(0, new ProcessTreeNode(0, 0, '???', ''));

	try {
		await getProcesses((pid: number, ppid: number, command: string, args: string) => {
			if (pid !== ppid) {
				map.set(pid, new ProcessTreeNode(pid, ppid, command, args));
			}
		});
	} catch (err) {
		return undefined;
	}

	const values = map.values();
	for (const p of values) {
		const parent = map.get(p.ppid);
		if (parent && parent !== p) {
			if (!parent.children) {
				parent.children = [];
			}
			parent.children.push(p);
		}
	}

	if (!isNaN(rootPid) && rootPid > 0) {
		return map.get(rootPid);
	}
	return map.get(0);
}

export function getProcesses(one: (pid: number, ppid: number, command: string, args: string, date?: number) => void) : Promise<void> {

	// returns a function that aggregates chunks of data until one or more complete lines are received and passes them to a callback.
	function lines(callback: (a: string) => void) {
		let unfinished = '';	// unfinished last line of chunk
		return (data: string | Buffer) => {
			const lines = data.toString().split(/\r?\n/);
			const finishedLines = lines.slice(0, lines.length - 1);
			finishedLines[0] = unfinished + finishedLines[0]; // complete previous unfinished line
			unfinished = lines[lines.length - 1]; // remember unfinished last line of this chunk for next round
			for (const s of finishedLines) {
				callback(s);
			}
		};
	}

	return new Promise((resolve, reject) => {

		let proc: ChildProcessWithoutNullStreams;
		let onComplete: (() => void) | undefined;

		if (process.platform === 'win32') {

			const powershell = join(process.env['WINDIR'] || 'C:\\Windows',
				'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
			const script = [
				"$ErrorActionPreference = 'Stop';",
				"[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false);",
				"$processes = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine,",
				"@{Name='CreationDate';Expression={if ($_.CreationDate) {",
				"[long]$_.CreationDate.ToString('yyyyMMddHHmmss', [System.Globalization.CultureInfo]::InvariantCulture)",
				"}}});",
				"ConvertTo-Json -InputObject $processes -Compress"
			].join(' ');
			proc = spawn(powershell, [ '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script ], { windowsHide: true });
			let output = '';
			proc.stdout.setEncoding('utf8');
			proc.stdout.on('data', data => output += data);
			onComplete = () => {
				const processes: {
					ProcessId: number;
					ParentProcessId: number;
					CommandLine: string | null;
					CreationDate: number | null;
				}[] = JSON.parse(output);
				if (!Array.isArray(processes)) {
					throw new Error('Invalid Windows process list.');
				}
				for (const entry of processes) {
					if (!entry || !Number.isInteger(entry.ProcessId) || !Number.isInteger(entry.ParentProcessId)
						|| (entry.CommandLine !== null && typeof entry.CommandLine !== 'string')
						|| (entry.CreationDate !== null && !Number.isFinite(entry.CreationDate))) {
						throw new Error('Invalid Windows process information.');
					}
					if (!entry.CommandLine || !entry.CommandLine.trim()) {
						continue;
					}
					let args = entry.CommandLine.trim();
					let command = args;
					if (args[0] === '"') {
						const end = args.indexOf('"', 1);
						if (end > 0) {
							command = args.slice(1, end);
							args = args.slice(end + 1).trimStart();
						}
					} else {
						const end = args.search(/\s/);
						if (end > 0) {
							command = args.slice(0, end);
							args = args.slice(end).trimStart();
						} else {
							args = '';
						}
					}
					one(entry.ProcessId, entry.ParentProcessId, command, args, entry.CreationDate ?? undefined);
				}
			};

		} else if (process.platform === 'darwin') {	// OS X

			proc = spawn('/bin/ps', [ '-x', '-o', `pid,ppid,comm=${'a'.repeat(256)},command` ]);
			proc.stdout.setEncoding('utf8');
			proc.stdout.on('data', lines(line => {

				const pid = Number(line.substr(0, 5));
				const ppid = Number(line.substr(6, 5));
				const command = line.substr(12, 256).trim();
				const args = line.substr(269 + command.length);

				if (!isNaN(pid) && !isNaN(ppid)) {
					one(pid, ppid, command, args);
				}
			}));

		} else {	// linux

			proc = spawn('/bin/ps', [ '-ax', '-o', 'pid:6,ppid:6,comm:20,command' ]);	// we specify the column width explicitly
			proc.stdout.setEncoding('utf8');
			proc.stdout.on('data', lines(line => {
				
				// the following substr arguments must match the column width specified for the "ps" command above
				// regular substr is deprecated
				const pid = Number(substr(line, 0, 6));
				const ppid = Number(substr(line, 7, 6));
				const shortName = substr(line, 14, 20).trim()
				const fullCommand = substr(line, 35)

				let command = shortName;
				let args = fullCommand;

				const pos = fullCommand.indexOf(shortName);
				if (pos >= 0) {
					// binaries with spaces in path may not work
					// possible solution to read directly from /proc
					const commandEndPositionMaybe = fullCommand.indexOf(" ", pos + shortName.length);
					const commandEndPosition = commandEndPositionMaybe < 0 ? fullCommand.length : commandEndPositionMaybe;
					command = fullCommand.substring(0, commandEndPosition)
					args = fullCommand.substring(commandEndPosition).trimStart()
				}


				if (!isNaN(pid) && !isNaN(ppid)) {
					one(pid, ppid, command, args);
				}
			}));
		}

		proc.on('error', err => {
			reject(err);
		});

		proc.stderr.setEncoding('utf8');
		proc.stderr.on('data', data => {
			const e = data.toString();
			if (e.indexOf('screen size is bogus') >= 0) {
				// ignore this error silently; see https://github.com/microsoft/vscode/issues/75932
			} else {
				reject(new Error(data.toString()));
			}
		});

		proc.on('close', (code, signal) => {
			if (code === 0) {
				try {
					onComplete?.();
				} catch (err) {
					reject(err);
					return;
				}
				resolve();
			} else if (code !== null && code > 0) {
				reject(new Error(`process terminated with exit code: ${code}`));
			}
			if (signal) {
				reject(new Error(`process terminated with signal: ${signal}`));
			}
		});

		proc.on('exit', (code, signal) => {
			if (typeof code === 'number') {
				if (code === 0) {
					//resolve();
				} else if (code > 0) {
					reject(new Error(`process terminated with exit code: ${code}`));
				}
			}
			if (signal) {
				reject(new Error(`process terminated with signal: ${signal}`));
			}
		});
	});
}

function substr(str: string, startIndex: number, length?: number) {
	return str.slice(startIndex, length != undefined ? startIndex + length : str.length)
}
