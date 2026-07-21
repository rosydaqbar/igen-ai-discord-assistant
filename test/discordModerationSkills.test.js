import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSkillsFromDir } from '../src/runtime/skillLoader.js';

const REQUIRED_SKILLS = [
  'moderation.kick',
  'moderation.timeout',
  'moderation.remove_timeout',
  'moderation.ban',
  'moderation.unban',
  'moderation.delete_message',
  'moderation.bulk_delete_messages',
  'moderation.create_role',
  'moderation.edit_role',
  'moderation.delete_role',
  'moderation.add_role_to_member',
  'moderation.remove_role_from_member',
  'moderation.create_channel',
  'moderation.edit_channel',
  'moderation.delete_channel',
];

test('discord moderation skill pack exposes the expected capabilities', async () => {
  const registry = await loadSkillsFromDir('./skills');
  for (const name of REQUIRED_SKILLS) {
    assert.ok(registry.get(name), `missing skill: ${name}`);
  }
});
