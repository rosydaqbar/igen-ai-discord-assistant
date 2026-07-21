import { spawn } from 'node:child_process';
import { shouldBlockCommand, requiresApproval } from './policy.js';

export class TerminalExecutor {
  constructor({ cwd, timeoutMs = 30000, maxOutputBytes = 20000, mode = 'approval' }) {
    this.cwd = cwd;
    this.timeoutMs = timeoutMs;
    this.maxOutputBytes = maxOutputBytes;
    this.mode = mode;
  }

  async run(command, context = {}) {
    if (this.mode === 'off') throw new Error('Terminal tool is disabled');
    if (shouldBlockCommand(command)) throw new Error('Terminal command blocked by safety policy');
    if (this.mode === 'approval' && requiresApproval(command) && !context.approved) {
      throw new Error('Terminal command requires approval');
    }

    return new Promise((resolve, reject) => {
      const child = spawn(command, {
        cwd: this.cwd,
        shell: true,
        env: safeEnv(process.env),
      });
      let output = '';
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('Terminal command timed out'));
      }, this.timeoutMs);

      const append = (chunk) => {
        output += chunk.toString();
        if (Buffer.byteLength(output) > this.maxOutputBytes) {
          output = output.slice(0, this.maxOutputBytes) + '\n[output truncated]';
          child.kill('SIGTERM');
        }
      };

      child.stdout.on('data', append);
      child.stderr.on('data', append);
      child.on('error', reject);
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ ok: code === 0, exitCode: code, output });
      });
    });
  }
}

function safeEnv(env) {
  const blocked = /TOKEN|KEY|SECRET|PASSWORD/i;
  return Object.fromEntries(Object.entries(env).filter(([key]) => !blocked.test(key)));
}
