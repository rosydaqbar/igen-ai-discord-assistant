export class ToolLoop {
  constructor({ llm, skillExecutor, registry, maxTurns = 4 }) {
    this.llm = llm;
    this.skillExecutor = skillExecutor;
    this.registry = registry;
    this.maxTurns = maxTurns;
  }

  async run({ userMessage, context }) {
    const messages = [
      { role: 'system', content: systemPrompt() },
      { role: 'user', content: userMessage },
    ];

    for (let i = 0; i < this.maxTurns; i += 1) {
      const reply = await this.llm.chat({ messages, tools: this.registry.toTools() });
      messages.push(reply);
      const calls = reply.tool_calls ?? [];
      if (calls.length === 0) return reply.content ?? '';

      for (const call of calls) {
        const args = JSON.parse(call.function.arguments || '{}');
        const result = await this.skillExecutor.execute(call.function.name, args, context);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }
    return 'I hit the tool loop limit before producing a final answer.';
  }
}

function systemPrompt() {
  return [
    'You are Igen AI, an adaptive Discord assistant.',
    'Use structured skills when a user asks for moderation or terminal actions.',
    'Do not claim an action succeeded until the skill result says ok=true.',
    'Ask for missing IDs, durations, reasons, or approval instead of guessing.',
  ].join(' ');
}
