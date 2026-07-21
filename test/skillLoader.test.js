import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { loadSkillsFromDir } from '../src/runtime/skillLoader.js';

async function tempSkillsDir() {
  return mkdtemp(path.join(tmpdir(), 'igen-skills-'));
}

test('loads YAML skills and exposes LLM tool schemas', async () => {
  const dir = await tempSkillsDir();
  await writeFile(path.join(dir, 'moderation.yaml'), `
skills:
  - name: moderation.timeout
    description: Timeout a member
    input_schema:
      type: object
      required: [guildId, targetUserId, durationSeconds, reason]
      properties:
        guildId: { type: string }
        targetUserId: { type: string }
        durationSeconds: { type: integer, minimum: 1, maximum: 2419200 }
        reason: { type: string }
    discord:
      method: PATCH
      endpoint: /guilds/{guildId}/members/{targetUserId}
      body:
        communication_disabled_until: "{{ timeoutUntilIso(durationSeconds) }}"
      success_status: [200]
`);

  const registry = await loadSkillsFromDir(dir);
  const skill = registry.get('moderation.timeout');

  assert.equal(skill.name, 'moderation.timeout');
  assert.deepEqual(registry.toTools(), [{
    type: 'function',
    function: {
      name: 'moderation.timeout',
      description: 'Timeout a member',
      parameters: skill.inputSchema,
    },
  }]);
});

test('loads YAML skills from nested directories', async () => {
  const dir = await tempSkillsDir();
  const nested = path.join(dir, 'discord-moderation');
  await mkdir(nested);
  await writeFile(path.join(nested, 'roles.yaml'), 'skills:\n  - name: moderation.create_role\n    description: Create role\n');

  const registry = await loadSkillsFromDir(dir);

  assert.equal(registry.get('moderation.create_role').description, 'Create role');
});

test('rejects duplicate skill names', async () => {
  const dir = await tempSkillsDir();
  await writeFile(path.join(dir, 'one.yaml'), 'skills:\n  - name: moderation.kick\n    description: Kick\n');
  await writeFile(path.join(dir, 'two.yaml'), 'skills:\n  - name: moderation.kick\n    description: Kick again\n');

  await assert.rejects(() => loadSkillsFromDir(dir), /Duplicate skill/);
});
