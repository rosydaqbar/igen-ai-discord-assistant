import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { readEnvSource } from '../src/config/envSource.js';

test('reads env source text so API key line order is preserved', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'igen-env-'));
  const file = path.join(dir, '.env');
  const expected = 'GEMINI_API_KEY=x\nOPENAI_API_KEY=y\n';
  await writeFile(file, expected);

  assert.equal(readEnvSource(file), expected);
});

test('returns empty text when env file does not exist', () => {
  assert.equal(readEnvSource('/definitely/missing/.env'), '');
});
