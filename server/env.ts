import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Environment } from './config.js';

export const projectEnvironmentPath = resolve(process.cwd(), '.env');

const parseValue = (rawValue: string): string => {
  const trimmedValue = rawValue.trim();
  const quote = trimmedValue.at(0);

  if ((quote === '"' || quote === "'") && trimmedValue.endsWith(quote)) {
    return trimmedValue.slice(1, -1);
  }

  return trimmedValue.replace(/\s+#.*$/, '');
};

export const loadProjectEnvironment = (
  environment: Environment = process.env,
  environmentPath = projectEnvironmentPath,
): void => {
  let contents: string;

  try {
    contents = readFileSync(environmentPath, 'utf8');
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return;
    }

    throw error;
  }

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const assignment = line.replace(/^export\s+/, '');
    const separator = assignment.indexOf('=');
    if (separator < 1) {
      continue;
    }

    const key = assignment.slice(0, separator).trim();
    if (!key || environment[key] !== undefined) {
      continue;
    }

    environment[key] = parseValue(assignment.slice(separator + 1));
  }
};
