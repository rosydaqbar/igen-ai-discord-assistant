import test from 'node:test';
import assert from 'node:assert/strict';

import { validateInput } from '../src/runtime/skillExecutor.js';

test('validates boolean inputs', () => {
  const schema = {
    type: 'object',
    required: ['mute'],
    properties: { mute: { type: 'boolean' } },
  };

  assert.doesNotThrow(() => validateInput(schema, { mute: false }));
  assert.throws(() => validateInput(schema, { mute: 'false' }), /mute must be a boolean/);
});

test('validates array inputs and item counts', () => {
  const schema = {
    type: 'object',
    required: ['messageIds'],
    properties: {
      messageIds: {
        type: 'array',
        minItems: 2,
        maxItems: 3,
        items: { type: 'string' },
      },
    },
  };

  assert.doesNotThrow(() => validateInput(schema, { messageIds: ['1', '2'] }));
  assert.throws(() => validateInput(schema, { messageIds: ['1'] }), /messageIds must have at least 2 items/);
  assert.throws(() => validateInput(schema, { messageIds: ['1', '2', '3', '4'] }), /messageIds must have at most 3 items/);
  assert.throws(() => validateInput(schema, { messageIds: ['1', 2] }), /messageIds\[1\] must be a string/);
});
