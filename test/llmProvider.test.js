import test from 'node:test';
import assert from 'node:assert/strict';

import { buildProviderConfigs, MultiProviderLLMClient } from '../src/llm/client.js';

test('builds provider priority from API key line positions in env text', () => {
  const env = {
    GEMINI_API_KEY: 'gemini-key',
    GEMINI_MODEL: 'gemini-model',
    OPENAI_API_KEY: 'openai-key',
    OPENAI_MODEL: 'openai-model',
  };
  const envText = `
GEMINI_API_KEY=gemini-key
GEMINI_MODEL=gemini-model
OPENAI_API_KEY=openai-key
OPENAI_MODEL=openai-model
`;

  const providers = buildProviderConfigs(env, envText);

  assert.deepEqual(providers.map((provider) => provider.name), ['gemini', 'openai']);
});

test('uses built-in provider endpoints and ignores base URL environment variables', () => {
  const providers = buildProviderConfigs({
    OPENAI_API_KEY: 'openai-key',
    OPENAI_MODEL: 'openai-model',
    OPENAI_BASE_URL: 'https://wrong.example/v1',
    GEMINI_API_KEY: 'gemini-key',
    GEMINI_MODEL: 'gemini-model',
    GEMINI_BASE_URL: 'https://wrong.example/gemini',
  }, 'OPENAI_API_KEY=x\nGEMINI_API_KEY=x\n');

  assert.equal(providers[0].baseUrl, 'https://api.openai.com/v1');
  assert.equal(providers[1].baseUrl, 'https://generativelanguage.googleapis.com/v1beta/openai');
});

test('falls back to documented order when API keys come from the host environment', () => {
  const providers = buildProviderConfigs({
    OPENROUTER_API_KEY: 'openrouter-key',
    OPENROUTER_MODEL: 'openrouter-model',
    CLAUDE_API_KEY: 'claude-key',
    CLAUDE_MODEL: 'claude-model',
  }, '');

  assert.deepEqual(providers.map((provider) => provider.name), ['claude', 'openrouter']);
});

test('falls back to the next configured provider when the first provider fails', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (calls.length === 1) return { ok: false, status: 500, json: async () => ({}) };
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { role: 'assistant', content: 'fallback ok' } }] }),
    };
  };
  const client = new MultiProviderLLMClient({
    providers: [
      { name: 'openai', apiKey: 'openai-key', baseUrl: 'https://api.openai.com/v1', model: 'openai-model', endpointKind: 'openai-compatible' },
      { name: 'openrouter', apiKey: 'openrouter-key', baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter-model', endpointKind: 'openai-compatible' },
    ],
    fetchImpl,
  });

  const reply = await client.chat({ messages: [{ role: 'user', content: 'hi' }], tools: [] });

  assert.equal(reply.content, 'fallback ok');
  assert.equal(calls.length, 2);
  assert.match(calls[0], /api\.openai\.com/);
  assert.match(calls[1], /openrouter\.ai/);
});

test('falls back when a provider returns JSON without an assistant message', async () => {
  let callCount = 0;
  const fetchImpl = async () => {
    callCount += 1;
    if (callCount === 1) {
      return { ok: true, status: 200, json: async () => ({ status: 'challenge' }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { role: 'assistant', content: 'valid fallback' } }] }),
    };
  };
  const client = new MultiProviderLLMClient({
    providers: [
      { name: 'agentrouter', apiKey: 'a', baseUrl: 'https://agentrouter.org/v1', model: 'model-a', endpointKind: 'openai-compatible' },
      { name: 'openai', apiKey: 'b', baseUrl: 'https://api.openai.com/v1', model: 'model-b', endpointKind: 'openai-compatible' },
    ],
    fetchImpl,
  });

  const reply = await client.chat({ messages: [{ role: 'user', content: 'hi' }], tools: [] });

  assert.equal(reply.content, 'valid fallback');
  assert.equal(callCount, 2);
});

test('converts Claude tool calls and tool results to Anthropic message blocks', async () => {
  let requestBody;
  const fetchImpl = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: 'done' }] }),
    };
  };
  const client = new MultiProviderLLMClient({
    providers: [{
      name: 'claude',
      apiKey: 'claude-key',
      baseUrl: 'https://api.anthropic.com/v1',
      model: 'claude-model',
      endpointKind: 'anthropic',
    }],
    fetchImpl,
  });

  await client.chat({
    messages: [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'ban user' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'tool-1', function: { name: 'moderation.ban', arguments: '{"targetUserId":"1"}' } }],
      },
      { role: 'tool', tool_call_id: 'tool-1', content: '{"ok":true}' },
    ],
    tools: [],
  });

  assert.deepEqual(requestBody.messages[1].content[0], {
    type: 'tool_use',
    id: 'tool-1',
    name: 'moderation.ban',
    input: { targetUserId: '1' },
  });
  assert.deepEqual(requestBody.messages[2].content[0], {
    type: 'tool_result',
    tool_use_id: 'tool-1',
    content: '{"ok":true}',
  });
});

test('throws when no provider api keys are configured', () => {
  assert.throws(() => buildProviderConfigs({}, ''), /At least one LLM provider API key is required/);
});
