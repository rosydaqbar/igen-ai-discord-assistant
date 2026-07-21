import test from 'node:test';
import assert from 'node:assert/strict';

import { SkillExecutor } from '../src/runtime/skillExecutor.js';

function makeSkill(overrides = {}) {
  return {
    name: 'moderation.kick',
    description: 'Kick a member',
    inputSchema: {
      type: 'object',
      required: ['guildId', 'targetUserId', 'reason'],
      properties: {
        guildId: { type: 'string' },
        targetUserId: { type: 'string' },
        reason: { type: 'string' },
      },
    },
    safety: {
      confirmation_required: true,
      hierarchy: 'target_member',
    },
    permissions: {
      user: ['KickMembers'],
      bot: ['KickMembers'],
    },
    discord: {
      method: 'DELETE',
      endpoint: '/guilds/{guildId}/members/{targetUserId}',
      audit_log_reason: '{{ reason }}',
      success_status: [204],
    },
    ...overrides,
  };
}

test('requires approval before destructive skill execution', async () => {
  const executor = new SkillExecutor({
    registry: { get: () => makeSkill() },
    permissionChecker: { assertAllowed: async () => {} },
    discordRest: { request: async () => ({ status: 204 }) },
  });

  await assert.rejects(
    () => executor.execute('moderation.kick', {
      guildId: '1',
      targetUserId: '2',
      reason: 'spam',
    }, { approved: false, callerUserId: '3' }),
    /requires approval/,
  );
});

test('renders Discord REST request from skill definition', async () => {
  let captured;
  const executor = new SkillExecutor({
    registry: { get: () => makeSkill() },
    permissionChecker: { assertAllowed: async () => {} },
    discordRest: {
      request: async (request) => {
        captured = request;
        return { status: 204, body: null };
      },
    },
  });

  const result = await executor.execute('moderation.kick', {
    guildId: '10',
    targetUserId: '20',
    reason: 'spam raid',
  }, { approved: true, callerUserId: '30' });

  assert.equal(result.ok, true);
  assert.deepEqual(captured, {
    method: 'DELETE',
    path: '/guilds/10/members/20',
    body: undefined,
    auditLogReason: 'spam raid',
  });
});

test('rejects missing required input before REST call', async () => {
  let called = false;
  const executor = new SkillExecutor({
    registry: { get: () => makeSkill() },
    permissionChecker: { assertAllowed: async () => {} },
    discordRest: { request: async () => { called = true; return { status: 204 }; } },
  });

  await assert.rejects(
    () => executor.execute('moderation.kick', { guildId: '1', reason: 'spam' }, { approved: true }),
    /Missing required input: targetUserId/,
  );
  assert.equal(called, false);
});
