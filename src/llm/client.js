export const DEFAULT_PROVIDER_ORDER = ['openai', 'gemini', 'claude', 'openrouter', 'agentrouter'];

const PROVIDERS = {
  openai: {
    keyEnv: 'OPENAI_API_KEY',
    modelEnv: 'OPENAI_MODEL',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    endpointKind: 'openai-compatible',
  },
  gemini: {
    keyEnv: 'GEMINI_API_KEY',
    modelEnv: 'GEMINI_MODEL',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.0-flash',
    endpointKind: 'openai-compatible',
  },
  claude: {
    keyEnv: 'CLAUDE_API_KEY',
    modelEnv: 'CLAUDE_MODEL',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-haiku-latest',
    endpointKind: 'anthropic',
  },
  openrouter: {
    keyEnv: 'OPENROUTER_API_KEY',
    modelEnv: 'OPENROUTER_MODEL',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    endpointKind: 'openai-compatible',
  },
  agentrouter: {
    keyEnv: 'AGENTROUTER_API_KEY',
    modelEnv: 'AGENTROUTER_MODEL',
    defaultBaseUrl: 'https://agentrouter.org/v1',
    defaultModel: 'openai/gpt-4o-mini',
    endpointKind: 'openai-compatible',
  },
};

export function buildProviderConfigs(env = process.env, envText = '') {
  const namesByKeyEnv = new Map(
    Object.entries(PROVIDERS).map(([name, spec]) => [spec.keyEnv, name]),
  );
  const namesFromFile = [];
  const apiKeyLine = /^(?:export\s+)?([A-Z][A-Z0-9_]*_API_KEY)\s*=/gm;
  for (const match of envText.matchAll(apiKeyLine)) {
    const name = namesByKeyEnv.get(match[1]);
    if (name && !namesFromFile.includes(name)) namesFromFile.push(name);
  }
  const order = [...namesFromFile];
  for (const name of DEFAULT_PROVIDER_ORDER) {
    if (!order.includes(name)) order.push(name);
  }

  const providers = [];
  for (const name of order) {
    const spec = PROVIDERS[name];
    if (!spec) throw new Error(`Unknown LLM provider: ${name}`);
    const apiKey = env[spec.keyEnv];
    if (!apiKey) continue;
    providers.push({
      name,
      apiKey,
      baseUrl: spec.defaultBaseUrl,
      model: env[spec.modelEnv] ?? spec.defaultModel,
      endpointKind: spec.endpointKind,
    });
  }

  if (providers.length === 0) throw new Error('At least one LLM provider API key is required');
  return providers;
}

export class MultiProviderLLMClient {
  constructor({ providers = buildProviderConfigs(), fetchImpl = fetch }) {
    this.providers = providers;
    this.fetch = fetchImpl;
  }

  async chat({ messages, tools }) {
    const errors = [];
    for (const provider of this.providers) {
      try {
        const reply = await this.chatWithProvider(provider, { messages, tools });
        return reply;
      } catch (error) {
        errors.push(`${provider.name}: ${error.message}`);
      }
    }
    throw new Error(`All LLM providers failed: ${errors.join('; ')}`);
  }

  async chatWithProvider(provider, { messages, tools }) {
    if (provider.endpointKind === 'anthropic') {
      return this.chatWithAnthropic(provider, { messages, tools });
    }
    return this.chatWithOpenAICompatible(provider, { messages, tools });
  }

  async chatWithOpenAICompatible(provider, { messages, tools }) {
    const response = await this.fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: provider.model, messages, tools }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const message = data.choices?.[0]?.message;
    if (!hasAssistantOutput(message)) throw new Error('response did not contain assistant output');
    return message;
  }

  async chatWithAnthropic(provider, { messages, tools }) {
    const { system, anthropicMessages } = convertMessagesForAnthropic(messages);
    const response = await this.fetch(`${provider.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 1024,
        system,
        messages: anthropicMessages,
        tools: (tools ?? []).map(toAnthropicTool),
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const message = fromAnthropicMessage(data);
    if (!hasAssistantOutput(message)) throw new Error('response did not contain assistant output');
    return message;
  }
}

export class OpenAICompatibleClient extends MultiProviderLLMClient {
  constructor({ apiKey, baseUrl, model, fetchImpl = fetch }) {
    super({
      providers: [{
        name: 'custom-openai-compatible',
        apiKey,
        baseUrl: baseUrl ?? 'https://api.openai.com/v1',
        model,
        endpointKind: 'openai-compatible',
      }],
      fetchImpl,
    });
    if (!apiKey) throw new Error('MODEL_API_KEY is required');
  }
}

function convertMessagesForAnthropic(messages) {
  const systemParts = [];
  const anthropicMessages = [];

  const append = (role, blocks) => {
    if (blocks.length === 0) return;
    const previous = anthropicMessages.at(-1);
    if (previous?.role === role && Array.isArray(previous.content)) {
      previous.content.push(...blocks);
    } else {
      anthropicMessages.push({ role, content: blocks });
    }
  };

  for (const message of messages) {
    if (message.role === 'system') {
      if (message.content) systemParts.push(message.content);
      continue;
    }

    if (message.role === 'tool') {
      append('user', [{
        type: 'tool_result',
        tool_use_id: message.tool_call_id,
        content: message.content ?? '',
      }]);
      continue;
    }

    if (message.role === 'assistant') {
      const blocks = [];
      if (message.content) blocks.push({ type: 'text', text: message.content });
      for (const toolCall of message.tool_calls ?? []) {
        blocks.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function.name,
          input: JSON.parse(toolCall.function.arguments || '{}'),
        });
      }
      append('assistant', blocks);
      continue;
    }

    append('user', [{ type: 'text', text: message.content ?? '' }]);
  }

  return { system: systemParts.join('\n'), anthropicMessages };
}

function toAnthropicTool(tool) {
  return {
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters,
  };
}

function hasAssistantOutput(message) {
  return Boolean(
    message
    && (String(message.content ?? '').length > 0 || (message.tool_calls?.length ?? 0) > 0),
  );
}

function fromAnthropicMessage(data) {
  const text = data.content?.filter((item) => item.type === 'text').map((item) => item.text).join('\n') ?? '';
  const toolCalls = data.content?.filter((item) => item.type === 'tool_use').map((item) => ({
    id: item.id,
    type: 'function',
    function: {
      name: item.name,
      arguments: JSON.stringify(item.input ?? {}),
    },
  })) ?? [];
  return { role: 'assistant', content: text, tool_calls: toolCalls };
}
