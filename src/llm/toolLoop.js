import { readFile, writeFile } from 'node:fs/promises';
import { logger } from '../logger.js';

const MAX_HISTORY = 40;

export class ToolLoop {
  constructor({ llm, skillExecutor, registry, maxTurns = 4 }) {
    this.llm = llm;
    this.skillExecutor = skillExecutor;
    this.registry = registry;
    this.maxTurns = maxTurns;
    this.sessions = new Map();
    this.savePath = null;
  }

  sessionKey(context) {
    return context.channelId ?? context.callerUserId ?? 'default';
  }

  getSessionKeys() {
    return [...this.sessions.keys()];
  }

  getSessionCount() {
    return this.sessions.size;
  }

  async loadSessions(filePath) {
    this.savePath = filePath;
    try {
      const data = JSON.parse(await readFile(filePath, 'utf8'));
      const sessions = data?.sessions;
      if (!sessions || typeof sessions !== 'object') return 0;
      let count = 0;
      for (const [key, history] of Object.entries(sessions)) {
        if (Array.isArray(history) && history.length > 0) {
          this.sessions.set(key, history);
          count += 1;
        }
      }
      logger.info(`Loaded ${count} sessions from ${filePath}`);
      return count;
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.info('No session file found, starting fresh');
      } else {
        logger.warn(`Failed to load sessions: ${error.message}`);
      }
      return 0;
    }
  }

  async saveSessions() {
    if (!this.savePath) return;
    const obj = {};
    for (const [key, history] of this.sessions) {
      obj[key] = history;
    }
    await writeFile(this.savePath, JSON.stringify({ sessions: obj }, null, 2));
  }

  resetSessions() {
    this.sessions.clear();
    logger.info('All sessions cleared');
  }

  async run({ userMessage, context, allowedSkillNames }) {
    const tools = this.filterTools(allowedSkillNames);
    if (tools.length === 0) {
      logger.info('No skills available — skipping LLM call');
      return 'You do not have permission to use any commands in this server.';
    }

    const key = this.sessionKey(context);
    const sys = systemPrompt(context);
    const history = this.sessions.get(key) ?? [];
    logger.info(`Session [${key}]: ${history.length} past messages in history`);
    const messages = [{ role: 'system', content: sys }];
    const recent = history.slice(-MAX_HISTORY);
    messages.push(...recent);
    messages.push({ role: 'user', content: userMessage });

    const turnMessages = [{ role: 'user', content: userMessage }];

    for (let i = 0; i < this.maxTurns; i += 1) {
      logger.info(`LLM turn ${i + 1}/${this.maxTurns}`);
      logger.info(`---[PROMPT]---`);
      logger.info(`System: ${messages[0]?.content ?? '(none)'}`);
      for (const m of messages.slice(1)) {
        const label = m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Asst' : m.role === 'tool' ? 'Tool' : m.role;
        const text = m.content ? (m.content.length > 400 ? m.content.slice(0, 400) + '...' : m.content) : '';
        const tc = m.tool_calls ? ` [${m.tool_calls.length} tool call(s)]` : '';
        const ti = m.tool_call_id ? ` [id:${m.tool_call_id.slice(0, 8)}]` : '';
        logger.info(`${label}:${ti}${tc} ${text}`);
      }
      logger.info(`Tools: ${(tools ?? []).map((t) => t.function.name).join(', ')}`);
      logger.info(`---[END]---`);
      const reply = await this.llm.chat({ messages, tools });
      messages.push(reply);
      turnMessages.push(reply);
      const calls = reply.tool_calls ?? [];
      if (calls.length === 0) {
        history.push(...turnMessages);
        this.sessions.set(key, history);
        await this.saveSessions();
        logger.info(`LLM final response: "${(reply.content ?? '').slice(0, 300)}"`);
        return reply.content ?? '';
      }

      for (const call of calls) {
        const args = JSON.parse(call.function.arguments || '{}');
        logger.info(`Tool call: ${call.function.name} ${JSON.stringify(args)}`);
        const result = await this.skillExecutor.execute(call.function.name, args, context);
        logger.info(`Tool result: ${JSON.stringify(result).slice(0, 300)}`);
        const toolResult = {
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        };
        messages.push(toolResult);
        turnMessages.push(toolResult);
      }
    }
    logger.warn('Tool loop limit reached');
    return 'I hit the tool loop limit before producing a final answer.';
  }

  filterTools(allowedSkillNames) {
    if (!allowedSkillNames) return this.registry.toTools();
    const allowed = new Set(allowedSkillNames);
    return this.registry.toTools().filter((t) => allowed.has(t.function.name));
  }
}

function systemPrompt(context = {}) {
  const parts = [
    'You are Igen AI, an adaptive Discord assistant.',
    'Use structured skills when a user asks for moderation or terminal actions.',
    'Do not claim an action succeeded until the skill result says ok=true.',
    'Ask for missing IDs, durations, reasons, or approval instead of guessing.',
  ];
  if (context.guildId) {
    parts.push(`Current guild ID: ${context.guildId}`);
  }
  if (context.channelId) {
    parts.push(`Current channel ID: ${context.channelId}`);
  }
  parts.push(`Your caller user ID: ${context.callerUserId ?? 'unknown'}`);
  return parts.join(' ');
}
