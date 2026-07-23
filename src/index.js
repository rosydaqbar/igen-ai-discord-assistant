import 'dotenv/config';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { mkdir } from 'node:fs/promises';

import { DiscordRestClient } from './discord/restClient.js';
import { PermissionChecker } from './discord/permissions.js';
import { readEnvSource } from './config/envSource.js';
import { MultiProviderLLMClient, buildProviderConfigs } from './llm/client.js';
import { ToolLoop } from './llm/toolLoop.js';
import { loadSkillsFromDir } from './runtime/skillLoader.js';
import { SkillExecutor } from './runtime/skillExecutor.js';
import { TerminalExecutor } from './terminal/executor.js';
import { logger } from './logger.js';

const config = {
  discordToken: process.env.DISCORD_BOT_TOKEN,
  providers: buildProviderConfigs(process.env, readEnvSource()),
  skillsDir: process.env.SKILLS_DIR ?? './skills',
  terminalMode: process.env.TERMINAL_MODE ?? 'off',
  terminalCwd: process.env.TERMINAL_CWD ?? './workspace',
  controlChannelId: process.env.CONTROL_CHANNEL_ID ?? '',
};

await mkdir(config.terminalCwd, { recursive: true });

const registry = await loadSkillsFromDir(config.skillsDir);
const discordRest = new DiscordRestClient({ token: config.discordToken });
const permissionChecker = new PermissionChecker();
const terminalExecutor = new TerminalExecutor({ cwd: config.terminalCwd, mode: config.terminalMode });
const skillExecutor = new SkillExecutor({ registry, permissionChecker, discordRest, terminalExecutor });
const llm = new MultiProviderLLMClient({ providers: config.providers });
const toolLoop = new ToolLoop({ llm, skillExecutor, registry });

const sessionFile = `${config.terminalCwd}/sessions.json`;
const loadedCount = await toolLoop.loadSessions(sessionFile);
let awaitingSessionDecision = loadedCount > 0 && config.controlChannelId !== '';
if (loadedCount > 0 && !config.controlChannelId) {
  logger.info(`Loaded ${loadedCount} session(s). Set CONTROL_CHANNEL_ID in .env to prompt for resume on startup.`);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel],
});

client.once('ready', async () => {
  logger.info(`Logged in as ${client.user.tag} (${client.user.id})`);
  if (awaitingSessionDecision && config.controlChannelId) {
    try {
      const channel = await client.channels.fetch(config.controlChannelId);
      if (channel?.isTextBased()) {
        await channel.send(`**Igen AI** — ${loadedCount} session(s) found from previous run. Reply with \`yes\` to resume or \`no\` to start fresh.`);
        logger.info(`Sent session prompt to control channel ${config.controlChannelId}`);
      }
    } catch (error) {
      logger.warn(`Could not send session prompt: ${error.message}`);
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (awaitingSessionDecision && message.channelId === config.controlChannelId) {
    const text = message.content.toLowerCase().trim();
    if (text === 'yes') {
      awaitingSessionDecision = false;
      await message.reply(`Resuming ${loadedCount} session(s).`);
      logger.info('Session decision: resume');
      return;
    }
    if (text === 'no') {
      toolLoop.resetSessions();
      awaitingSessionDecision = false;
      await message.reply('All sessions cleared, starting fresh.');
      logger.info('Session decision: fresh start');
      return;
    }
    return;
  }

  if (awaitingSessionDecision) return;

  const mentioned = message.mentions.has(client.user);
  if (!mentioned || message.channel.isDMBased()) return;

  const source = `guild:${message.guildId}/channel:${message.channelId}`;
  let content = message.content.replace(`<@${client.user.id}>`, '').replace(`<@!${client.user.id}>`, '').trim();

  let replyContext = '';
  if (message.reference?.messageId) {
    try {
      const ref = await message.channel.messages.fetch(message.reference.messageId);
      if (ref.author.id === client.user.id) {
        replyContext = `(replying to my previous message: "${(ref.content ?? '').slice(0, 500)}") `;
      }
    } catch {
      logger.warn('Failed to fetch referenced message for reply context');
    }
  }

  logger.info(`Message from ${message.author.username} (${message.author.id}) [${source}]: "${content.slice(0, 200)}"`);

  try {
    const context = {
      approved: /\bapprove\b/i.test(content),
      guildId: message.guildId,
      channelId: message.channelId,
      callerUserId: message.author.id,
      memberPermissions: message.member?.permissions,
    };
    let allowedSkillNames = permissionChecker.getAllowedSkillNames(registry, context);
    if (config.terminalMode === 'off') {
      allowedSkillNames = allowedSkillNames.filter((name) => !name.startsWith('terminal.'));
    }
    const blockedCount = registry.all().length - allowedSkillNames.length;
    if (blockedCount > 0) {
      logger.info(`Permission filter: ${allowedSkillNames.length} allowed, ${blockedCount} blocked for ${message.author.id}`);
    }

    await message.channel.sendTyping();
    const reply = await toolLoop.run({
      userMessage: replyContext + content,
      context,
      allowedSkillNames,
    });
    await message.reply(reply.slice(0, 1900) || 'Done.');
    logger.info(`Reply to ${message.author.id}: "${reply.slice(0, 200)}"`);
  } catch (error) {
    logger.error(`Failed for ${message.author.id}: ${error.message}`);
    await message.reply(`Igen error: ${error.message}`.slice(0, 1900));
  }
});

await client.login(config.discordToken);
