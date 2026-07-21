import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Minimal .env loader — imported before anything reads config, so `server/.env`
 * populates process.env without a dependency. Real environment variables always
 * win over the file.
 */
try {
  const here = dirname(fileURLToPath(import.meta.url));
  const text = readFileSync(resolve(here, '../.env'), 'utf8');
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    if (!key) continue;
    let value = (match[2] ?? '').trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
} catch {
  // No .env file — fall back to real environment variables.
}
