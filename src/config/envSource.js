import { readFileSync } from 'node:fs';

export function readEnvSource(filePath = process.env.DOTENV_CONFIG_PATH ?? '.env') {
  try {
    return readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}
