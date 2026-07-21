import { renderTemplate } from './template.js';

export class SkillExecutor {
  constructor({ registry, permissionChecker, discordRest, terminalExecutor }) {
    this.registry = registry;
    this.permissionChecker = permissionChecker;
    this.discordRest = discordRest;
    this.terminalExecutor = terminalExecutor;
  }

  async execute(name, args, context = {}) {
    const skill = this.registry.get(name);
    validateInput(skill.inputSchema, args);

    if (skill.safety?.confirmation_required && !context.approved) {
      throw new Error(`${name} requires approval before execution`);
    }

    if (skill.permissions && this.permissionChecker) {
      await this.permissionChecker.assertAllowed(skill, args, context);
    }

    if (skill.discord) return this.executeDiscordSkill(skill, args);
    if (skill.terminal) return this.executeTerminalSkill(skill, args, context);
    throw new Error(`${name} has no supported executor`);
  }

  async executeDiscordSkill(skill, args) {
    const request = {
      method: skill.discord.method,
      path: renderTemplate(skill.discord.endpoint, args),
      body: skill.discord.body === undefined ? undefined : renderTemplate(skill.discord.body, args),
      auditLogReason: skill.discord.audit_log_reason
        ? renderTemplate(skill.discord.audit_log_reason, args)
        : undefined,
    };
    const response = await this.discordRest.request(request);
    const expected = skill.discord.success_status ?? [200, 204];
    if (!expected.includes(response.status)) {
      throw new Error(`Discord REST failed: HTTP ${response.status}`);
    }
    return { ok: true, status: response.status, body: response.body ?? null };
  }

  async executeTerminalSkill(skill, args, context) {
    if (!this.terminalExecutor) throw new Error('Terminal executor is disabled');
    const command = renderTemplate(skill.terminal.command, args);
    return this.terminalExecutor.run(command, context);
  }
}

export function validateInput(schema, args) {
  for (const key of schema?.required ?? []) {
    if (args[key] === undefined || args[key] === null || args[key] === '') {
      throw new Error(`Missing required input: ${key}`);
    }
  }

  for (const [key, rules] of Object.entries(schema?.properties ?? {})) {
    const value = args[key];
    if (value === undefined) continue;
    if (rules.type === 'integer' && !Number.isInteger(value)) throw new Error(`${key} must be an integer`);
    if (rules.type === 'number' && typeof value !== 'number') throw new Error(`${key} must be a number`);
    if (rules.type === 'string' && typeof value !== 'string') throw new Error(`${key} must be a string`);
    if (rules.type === 'boolean' && typeof value !== 'boolean') throw new Error(`${key} must be a boolean`);
    if (rules.type === 'array') validateArray(key, value, rules);
    if (rules.minimum !== undefined && value < rules.minimum) throw new Error(`${key} must be >= ${rules.minimum}`);
    if (rules.maximum !== undefined && value > rules.maximum) throw new Error(`${key} must be <= ${rules.maximum}`);
  }
}

function validateArray(key, value, rules) {
  if (!Array.isArray(value)) throw new Error(`${key} must be an array`);
  if (rules.minItems !== undefined && value.length < rules.minItems) {
    throw new Error(`${key} must have at least ${rules.minItems} items`);
  }
  if (rules.maxItems !== undefined && value.length > rules.maxItems) {
    throw new Error(`${key} must have at most ${rules.maxItems} items`);
  }
  if (rules.items?.type) {
    value.forEach((item, index) => {
      if (rules.items.type === 'string' && typeof item !== 'string') throw new Error(`${key}[${index}] must be a string`);
      if (rules.items.type === 'integer' && !Number.isInteger(item)) throw new Error(`${key}[${index}] must be an integer`);
      if (rules.items.type === 'number' && typeof item !== 'number') throw new Error(`${key}[${index}] must be a number`);
      if (rules.items.type === 'boolean' && typeof item !== 'boolean') throw new Error(`${key}[${index}] must be a boolean`);
    });
  }
}
