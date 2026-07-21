import 'dotenv/config';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { mkdir } from 'node:fs/promises';

import { DiscordRestClient } from './discord/restClient.js';
import { PermissionChecker } from './discord/permissions.js';
import { OpenAICompatibleClient } from './llm/client.js';
import { ToolLoop } from './llm/toolLoop.js';
import { loadSkillsFromDir } from './runtime/skillLoader.js';
import { SkillExecutor } from './runtime/skillExecutor.js';
import { TerminalExecutor } from './terminal/executor.js';

const config = {
  discordToken: process.env.DISCORD_BOT_TOKEN,
  modelApiKey: process.env.MODEL_API_KEY,
  modelBaseUrl: process.env.MODEL_BASE_URL,
  modelName: process.env.MODEL_NAME ?? 'gpt-4o-mini',
  skillsDir: process.env.SKILLS_DIR ?? './skills',
  terminalMode: process.env.TERMINAL_MODE ?? 'off',
  terminalCwd: process.env.TERMINAL_CWD ?? './workspace',
};

await mkdir(config.terminalCwd, { recursive: true });

const registry = await loadSkillsFromDir(config.skillsDir);
const discordRest = new DiscordRestClient({ token: config.discordToken });
const permissionChecker = new PermissionChecker();
const terminalExecutor = new TerminalExecutor({ cwd: config.terminalCwd, mode: config.terminalMode });
const skillExecutor = new SkillExecutor({ registry, permissionChecker, discordRest, terminalExecutor });
const llm = new OpenAICompatibleClient({
  apiKey: config.modelApiKey,
  baseUrl: config.modelBaseUrl,
  model: config.modelName,
});
const toolLoop = new ToolLoop({ llm, skillExecutor, registry });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel],
});

client.once('ready', () => {
  console.log(`Igen AI Discord Assistant logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const mentioned = message.mentions.has(client.user);
  if (!mentioned && !message.channel.isDMBased()) return;

  try {
    await message.channel.sendTyping();
    const content = message.content.replace(`<@${client.user.id}>`, '').replace(`<@!${client.user.id}>`, '').trim();
    const reply = await toolLoop.run({
      userMessage: content,
      context: {
        approved: /\bapprove\b/i.test(content),
        guildId: message.guildId,
        channelId: message.channelId,
        callerUserId: message.author.id,
        memberPermissions: message.member?.permissions,
      },
    });
    await message.reply(reply.slice(0, 1900) || 'Done.');
  } catch (error) {
    await message.reply(`Igen error: ${error.message}`.slice(0, 1900));
  }
});

await client.login(config.discordToken);
