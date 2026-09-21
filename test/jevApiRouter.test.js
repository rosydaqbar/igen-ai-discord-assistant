import test from 'node:test';
import assert from 'node:assert/strict';

import { JevApiRouter } from '../src/jev/apiRouter.js';

const catalog = {
  operations: [
    {
      id: 'discord.modify_guild_member',
      description: 'Modify member',
      method: 'PATCH',
      path: '/guilds/{guildId}/members/{targetUserId}',
      bodyFields: [
        {
          name: 'communication_disabled_until',
          description: 'Timeout until',
          valueType: 'relative_datetime_or_null',
        },
      ],
    },
    {
      id: 'discord.remove_guild_member',
      description: 'Remove member',
      method: 'DELETE',
      path: '/guilds/{guildId}/members/{targetUserId}',
    },
  ],
};

test('routes a direct moderation request to a Discord API operation', async () => {
  const client = {
    systemOne: async () => ({
      answers: {
        operation: {
          choice: 'discord.remove_guild_member',
          probabilities: {
            'discord.remove_guild_member': 0.98,
          },
        },
        bodyField: {
          choice: 'none',
          probabilities: { none: 0.99 },
        },
        clearBodyField: { noul: 0.01 },
      },
    }),
  };

  const router = new JevApiRouter({
    client,
    catalog,
    confidenceThreshold: 0.85,
  });

  const result = await router.route({
    request: 'kick @john',
    guildId: '1',
    targetUserIds: ['2'],
  });

  assert.equal(result.kind, 'operation');
  assert.equal(result.operation.id, 'discord.remove_guild_member');
  assert.equal(result.confidence, 0.98);
});

test('routes normal conversation away from direct API execution', async () => {
  const client = {
    systemOne: async () => ({
      answers: {
        operation: {
          choice: '__conversation__',
          probabilities: { '__conversation__': 0.97 },
        },
        bodyField: { choice: 'none', probabilities: { none: 1 } },
        clearBodyField: { noul: 0 },
      },
    }),
  };

  const router = new JevApiRouter({ client, catalog });
  const result = await router.route({
    request: 'why was john timed out?',
    guildId: '1',
    targetUserIds: [],
  });

  assert.equal(result.kind, 'conversation');
});

test('refuses to execute a low-confidence action', async () => {
  const client = {
    systemOne: async () => ({
      answers: {
        operation: {
          choice: 'discord.remove_guild_member',
          probabilities: {
            'discord.remove_guild_member': 0.52,
          },
        },
        bodyField: { choice: 'none', probabilities: { none: 1 } },
        clearBodyField: { noul: 0 },
      },
    }),
  };

  const router = new JevApiRouter({
    client,
    catalog,
    confidenceThreshold: 0.85,
  });

  const result = await router.route({
    request: 'deal with john',
    guildId: '1',
    targetUserIds: ['2'],
  });

  assert.equal(result.kind, 'clarification');
});
