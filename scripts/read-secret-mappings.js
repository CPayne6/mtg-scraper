#!/usr/bin/env node

/**
 * Helper script to read secret mappings JSON and output in bash-friendly format
 * Usage: node read-secret-mappings.js <path-to-json>
 */

const fs = require('fs');
const path = require('path');

const jsonPath = process.argv[2] || path.join(__dirname, 'secret-mappings.json');

if (!fs.existsSync(jsonPath)) {
  console.error(`Error: Secret mappings file not found: ${jsonPath}`);
  process.exit(1);
}

try {
  const data = fs.readFileSync(jsonPath, 'utf8');
  const mappings = JSON.parse(data);

  // Output each secret in pipe-delimited format for bash to read
  // Format: name|envFile|envVar|optional
  mappings.secrets.forEach(secret => {
    console.log(`${secret.name}|${secret.envFile}|${secret.envVar}|${secret.optional}`);
  });
} catch (error) {
  console.error(`Error reading secret mappings: ${error.message}`);
  process.exit(1);
}
