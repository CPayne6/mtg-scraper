import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Load local development variables without overriding explicitly supplied env. */
export async function loadLocalEnv() {
  for (const filename of ['.env', '.env.local']) {
    try {
      const content = await readFile(resolve(process.cwd(), filename), 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (!match || process.env[match[1]] !== undefined) continue;
        const value = match[2].replace(/^(?:"|')(.*)(?:"|')$/, '$1');
        process.env[match[1]] = value;
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}
