import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DiscordApiExecutor,
  parseDurationSeconds,
} from '../src/discord/apiExecutor.js';

test('parses English and Indonesian durations', () => {
  assert.equal(parseDurationSeconds('1 hour 30 minutes'), 5400);
  assert.equal(parseDurationSeconds('2 jam 15 menit'), 8100);
  assert.equal(parseDurationSeconds('30 detik'), 30);
});

test('executes a Jev-selected timeout through the generic REST executor', async () => {
  let captured;
  const permissionCalls = [];

  const executor = new DiscordApiExecutor({
    now: () => Date.parse('2026-09-21T00:00:00.000Z'),
    permissionChecker: {
      assertAllowed: async (operation) => {
        permissionCalls.push(operation.id);
      },
    },
    discordRest: {
      request: async (request) => {
        captured = request;
        return { status: 200, body: {} };
      },
    },
  });

  const operation = {
    id: 'discord.modify_guild_member',
    method: 'PATCH',
    path: '/guilds/{guildId}/members/{targetUserId}',
    requiredContext: ['guildId', 'targetUserId'],
    permissions: {
      user: ['ModerateMembers'],
      bot: ['ModerateMembers'],
    },
    successStatus: [200],
    bodyFields: [
      {
        name: 'communication_disabled_until',
        valueType: 'relative_datetime_or_null',
      },
    ],
  };

  const result = await executor.execute({
    decision: {
      operation,
      bodyField: operation.bodyFields[0],
      clearBodyFieldProbability: 0.01,
    },
    context: {
      guildId: '10',
      callerUserId: '30',
      memberPermissions: ['ModerateMembers'],
    },
    requestText: 'timeout @john for 1 hour',
    targetUserIds: ['20'],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(permissionCalls, ['discord.modify_guild_member']);
  assert.deepEqual(captured, {
    method: 'PATCH',
    path: '/guilds/10/members/20',
    body: {
      communication_disabled_until: '2026-09-21T01:00:00.000Z',
    },
    auditLogReason: 'Igen request by 30: timeout @john for 1 hour',
  });
});

test('asks for a duration instead of inventing one', async () => {
  let called = false;
  const executor = new DiscordApiExecutor({
    permissionChecker: { assertAllowed: async () => {} },
    discordRest: {
      request: async () => {
        called = true;
        return { status: 200 };
      },
    },
  });

  const operation = {
    id: 'discord.modify_guild_member',
    method: 'PATCH',
    path: '/guilds/{guildId}/members/{targetUserId}',
    requiredContext: ['guildId', 'targetUserId'],
    permissions: { user: ['ModerateMembers'] },
    successStatus: [200],
    bodyFields: [
      {
        name: 'communication_disabled_until',
        valueType: 'relative_datetime_or_null',
      },
    ],
  };

  const result = await executor.execute({
    decision: {
      operation,
      bodyField: operation.bodyFields[0],
      clearBodyFieldProbability: 0.01,
    },
    context: {
      guildId: '10',
      callerUserId: '30',
      memberPermissions: ['ModerateMembers'],
    },
    requestText: 'timeout @john',
    targetUserIds: ['20'],
  });

  assert.equal(result.needsClarification, true);
  assert.equal(called, false);
});
