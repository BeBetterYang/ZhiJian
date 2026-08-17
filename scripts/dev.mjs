import { spawn } from 'node:child_process';

const commands = [
  spawn(process.execPath, ['server.mjs', '--api-only', '--port', '4174'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0', '--port', '4173'], { stdio: 'inherit' }),
];

const stop = () => commands.forEach((child) => child.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
commands.forEach((child) => child.on('exit', (code) => { if (code) process.exitCode = code; }));
