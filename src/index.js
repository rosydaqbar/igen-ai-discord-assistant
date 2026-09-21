import 'dotenv/config';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { mkdir } from 'node:fs/promises';

import { DiscordRestClient } from './discord/restClient.js';
import { PermissionChecker } from './discord/permissions.js';
import { loadDiscordApiCatalog } from './discord/apiCatalog.js';
import { DiscordApiExecutor } from './discord/apiExecutor.js';
import { readEnvSource } from './config/envSource.js';
import { MultiProviderLLMClient, buildProviderConfigs } from './llm/client.js';
import { ToolLoop } from './llm/toolLoop.js';
import { JevSystemOneClient } from './jev/client.js';
import { JevApiRouter } from './jev/apiRouter.js';
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
  typesafeApiKey: process.env.TYPESAFE_API_KEY ?? '',
  jevModel: process.env.JEV_MODEL ?? 'jev-latest',
  jevApiRouting: (process.env.JEV_API_ROUTING ?? 'on').toLowerCase() !== 'off',
  jevActionConfidence: Number(process.env.JEV_ACTION_CONFIDENCE ?? 0.85),
};

await mkdir(config.terminalCwd, { recursive: true });

const registry = await loadSkillsFromDir(config.skillsDir);
const discordRest = new DiscordRestClient({ token: config.discordToken });
const permissionChecker = new PermissionChecker();
const terminalExecutor = new TerminalExecutor({ cwd: config.terminalCwd, mode: config.terminalMode });
const skillExecutor = new SkillExecutor({ registry, permissionChecker, discordRest, terminalExecutor });
const llm = new MultiProviderLLMClient({ providers: config.providers });
const toolLoop = new ToolLoop({ llm, skillExecutor, registry });

let jevRouter = null;
let discordApiExecutor = null;

if (config.jevApiRouting && config.typesafeApiKey) {
  const apiCatalog = await loadDiscordApiCatalog();
  const jevClient = new JevSystemOneClient({
    apiKey: config.typesafeApiKey,
    model: config.jevModel,
  });

  jevRouter = new JevApiRouter({
    client: jevClient,
    catalog: apiCatalog,
    confidenceThreshold: config.jevActionConfidence,
  });

  discordApiExecutor = new DiscordApiExecutor({
    discordRest,
    permissionChecker,
  });

  logger.info(
    'Jev direct API routing enabled: model=' +
      config.jevModel +
      ' threshold=' +
      config.jevActionConfidence,
  );
} else {
  logger.info(
    'Jev direct API routing disabled. Set TYPESAFE_API_KEY and keep JEV_API_ROUTING=on to enable it.',
  );
}

const sessionFile = config.terminalCwd + '/sessions.json';
const loadedCount = await toolLoop.loadSessions(sessionFile);
let awaitingSessionDecision = loadedCount > 0 && config.controlChannelId !== '';
if (loadedCount > 0 && !config.controlChannelId) {
  logger.info(
    'Loaded ' +
      loadedCount +
      ' session(s). Set CONTROL_CHANNEL_ID in .env to prompt for resume on startup.',
  );
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
  logger.info('Logged in as ' + client.user.tag + ' (' + client.user.id + ')');
  if (awaitingSessionDecision && config.controlChannelId) {
    try {
      const channel = await client.channels.fetch(config.controlChannelId);
      if (channel?.isTextBased()) {
        await channel.send(
          '**Igen AI** — ' +
            loadedCount +
            ' session(s) found from previous run. Reply with `yes` to resume or `no` to start fresh.',
        );
        logger.info(
          'Sent session prompt to control channel ' + config.controlChannelId,
        );
      }
    } catch (error) {
      logger.warn('Could not send session prompt: ' + error.message);
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (awaitingSessionDecision && message.channelId === config.controlChannelId) {
    const text = message.content.toLowerCase().trim();
    if (text === 'yes') {
      awaitingSessionDecision = false;
      await message.reply('Resuming ' + loadedCount + ' session(s).');
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

  const source =
    'guild:' + message.guildId + '/channel:' + message.channelId;
  let content = message.content
    .replace('<@' + client.user.id + '>', '')
    .replace('<@!' + client.user.id + '>', '')
    .trim();

  let replyContext = '';
  if (message.reference?.messageId) {
    try {
      const ref = await message.channel.messages.fetch(message.reference.messageId);
      if (ref.author.id === client.user.id) {
        replyContext =
          '(replying to my previous message: "' +
          (ref.content ?? '').slice(0, 500) +
          '") ';
      }
    } catch {
      logger.warn('Failed to fetch referenced message for reply context');
    }
  }

  logger.info(
    'Message from ' +
      message.author.username +
      ' (' +
      message.author.id +
      ') [' +
      source +
      ']: "' +
      content.slice(0, 200) +
      '"',
  );

  try {
    const context = {
      approved: /\bapprove\b/i.test(content),
      guildId: message.guildId,
      channelId: message.channelId,
      callerUserId: message.author.id,
      memberPermissions: message.member?.permissions,
    };

    await message.channel.sendTyping();

    if (jevRouter && discordApiExecutor) {
      const targetUserIds = [...message.mentions.users.values()]
        .filter((user) => user.id !== client.user.id)
        .map((user) => user.id);

      let decision;
      try {
        decision = await jevRouter.route({
          request: content,
          guildId: message.guildId,
          targetUserIds,
        });
      } catch (error) {
        logger.error('Jev API router failed: ' + error.message);
        await message.reply(
          ('Jev routing error: ' + error.message).slice(0, 1900),
        );
        return;
      }

      logger.info(
        'Jev route: kind=' +
          decision.kind +
          ' confidence=' +
          Number(decision.confidence ?? 0).toFixed(3) +
          (decision.operation?.id
            ? ' operation=' + decision.operation.id
            : ''),
      );

      if (decision.kind === 'clarification') {
        await message.reply(decision.message);
        return;
      }

      if (decision.kind === 'operation') {
        const result = await discordApiExecutor.execute({
          decision,
          context,
          requestText: content,
          targetUserIds,
        });

        await message.reply(result.message.slice(0, 1900));
        return;
      }

      // Only Jev's explicit conversation route is allowed to fall through
      // to the existing generative assistant path.
    }

    let allowedSkillNames = permissionChecker.getAllowedSkillNames(registry, context);
    if (config.terminalMode === 'off') {
      allowedSkillNames = allowedSkillNames.filter(
        (name) => !name.startsWith('terminal.'),
      );
    }
    const blockedCount = registry.all().length - allowedSkillNames.length;
    if (blockedCount > 0) {
      logger.info(
        'Permission filter: ' +
          allowedSkillNames.length +
          ' allowed, ' +
          blockedCount +
          ' blocked for ' +
          message.author.id,
      );
    }

    const reply = await toolLoop.run({
      userMessage: replyContext + content,
      context,
      allowedSkillNames,
    });
    await message.reply(reply.slice(0, 1900) || 'Done.');
    logger.info(
      'Reply to ' +
        message.author.id +
        ': "' +
        reply.slice(0, 200) +
        '"',
    );
  } catch (error) {
    logger.error('Failed for ' + message.author.id + ': ' + error.message);
    await message.reply(('Igen error: ' + error.message).slice(0, 1900));
  }
});

await client.login(config.discordToken);
