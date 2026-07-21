import { spawn } from 'node:child_process';
import { ChronoError } from './errors.js';

export class Docker {
  constructor({ binary = process.env.CHRONOLAB_DOCKER || 'docker', env = process.env } = {}) {
    this.binary = binary;
    this.env = env;
  }

  run(args, { capture = true } = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.binary, args, {
        env: this.env,
        stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      });
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', chunk => { stdout += chunk; });
      child.stderr?.on('data', chunk => { stderr += chunk; });
      child.on('error', error => reject(new ChronoError('DOCKER_UNAVAILABLE', `Unable to run Docker: ${error.message}`)));
      child.on('close', code => {
        if (code === 0) return resolve(stdout.trim());
        reject(new ChronoError('DOCKER_FAILED', stderr.trim() || `Docker exited with status ${code}`, { args, exitCode: code }));
      });
    });
  }

  build(args) { return this.run(['build', ...args], { capture: false }); }
  stop(id) { return this.run(['stop', id]); }
  start(id) { return this.run(['start', id]); }
  remove(id) { return this.run(['rm', '-f', id]); }
  exec(id, args) { return this.run(['exec', id, ...args]); }
  inspect(id, format) { return this.run(['inspect', ...(format ? ['--format', format] : []), id]); }
}
