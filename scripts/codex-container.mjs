import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const repoPath = path.resolve(import.meta.dirname, '..');
const sshKeyPath = path.join(os.homedir(), '.ssh', 'id_ed25519');
const knownHostsPath = path.join(os.homedir(), '.ssh', 'known_hosts');

for (const requiredPath of [sshKeyPath, knownHostsPath]) {
  if (!fs.existsSync(requiredPath)) {
    throw new Error(`Required SSH file does not exist: ${requiredPath}`);
  }
}

function dockerWorkspacePath(hostPath) {
  if (process.platform !== 'win32') {
    return hostPath;
  }

  const match = /^([a-zA-Z]):[\\/](.*)$/.exec(hostPath);
  if (!match) {
    throw new Error(`Unable to translate Windows path for Docker Desktop: ${hostPath}`);
  }

  const [, drive, remainder] = match;
  return `/run/desktop/mnt/host/${drive.toLowerCase()}/${remainder.replaceAll('\\', '/')}`;
}

const mode = process.argv[2];
const composeArgs = ['compose', '-f', 'docker-compose.codex.yml'];

if (mode === '--build') {
  composeArgs.push('build', 'codex');
} else {
  const command = mode === '--shell'
    ? ['bash']
    : ['codex', '--dangerously-bypass-approvals-and-sandbox', ...process.argv.slice(2)];

  composeArgs.push('run', '--rm', 'codex', ...command);
}

const result = spawnSync('docker', composeArgs, {
  cwd: repoPath,
  env: {
    ...process.env,
    CODEX_WORKSPACE_PATH: dockerWorkspacePath(repoPath),
    CODEX_SSH_KEY_PATH: sshKeyPath,
    CODEX_KNOWN_HOSTS_PATH: knownHostsPath,
  },
  stdio: 'inherit',
});

if (result.error) {
  console.error(`Unable to start Docker: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
