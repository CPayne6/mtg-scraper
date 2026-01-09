#!/usr/bin/env node

/**
 * Cross-platform wrapper to run bash scripts with Git Bash on Windows
 * Usage: node run-bash.js <script-name> [args...]
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Get script name from arguments
const scriptName = process.argv[2];
const scriptArgs = process.argv.slice(3);

if (!scriptName) {
  console.error('Error: Script name required');
  console.error('Usage: node run-bash.js <script-name> [args...]');
  process.exit(1);
}

// Resolve script path
const scriptPath = path.join(__dirname, scriptName);

if (!fs.existsSync(scriptPath)) {
  console.error(`Error: Script not found: ${scriptPath}`);
  process.exit(1);
}

// Determine bash executable
let bashPath;

if (process.platform === 'win32') {
  // Try common Git Bash installation paths
  const possiblePaths = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    process.env.PROGRAMFILES + '\\Git\\bin\\bash.exe',
    process.env['PROGRAMFILES(X86)'] + '\\Git\\bin\\bash.exe',
  ];

  bashPath = possiblePaths.find(p => fs.existsSync(p));

  if (!bashPath) {
    // Fallback to PATH lookup (might use WSL)
    bashPath = 'bash.exe';
  }
} else {
  // Unix-like systems
  bashPath = 'bash';
}

// Run the script
const child = spawn(bashPath, [scriptPath, ...scriptArgs], {
  stdio: 'inherit',
  shell: false,
});

child.on('exit', (code) => {
  process.exit(code || 0);
});

child.on('error', (err) => {
  console.error(`Failed to execute bash: ${err.message}`);
  process.exit(1);
});
