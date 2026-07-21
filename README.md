# Igen AI Discord Assistant

Igen AI Discord Assistant is a small adaptive Discord bot runtime. It is built around data-driven skills instead of hardcoded moderation command files.

It works as a standalone bot, and it can also be paired with agentic coding tools such as Hermes Agent or OpenClaw. That integration is optional; when used, it should happen through the repository's Markdown integration skill, not by adding special-case command files.

The name comes from Japanese-ish "wisdom" energy: the bot should learn/adapt by changing skills and runtime behavior, not by adding one-off command scripts forever.

## What It Does

- Basic Discord conversation bot using an OpenAI-compatible chat API.
- Loads executable skills from YAML files in `skills/`.
- Exposes those skills to the LLM as structured tools.
- Executes Discord moderation through Discord REST API from skill definitions.
- Optionally exposes a guarded terminal tool.

## Architecture

```text
Discord message
  -> LLM chat request with loaded skill schemas
  -> LLM returns final text OR tool call
  -> generic SkillExecutor validates + executes the skill
  -> tool result goes back to LLM
  -> final Discord reply
```

There are no `kick.js`, `timeout.js`, or per-action command files. Moderation actions live in focused YAML files under `skills/discord-moderation/` as data:

- input schema
- permissions
- safety policy
- Discord REST method
- endpoint template
- request body template
- expected success statuses

## Quick Start

```bash
npm install
cp .env.example .env
# edit .env with your Discord bot token and at least one model provider API key
npm start
```

Required Discord bot intents:

- Guilds
- Guild Messages
- Message Content
- Guild Members

## Environment

Igen supports five providers:

- OpenAI
- Gemini
- Claude / Anthropic
- OpenRouter
- AgentRouter

Configure one or more provider blocks in `.env`. Each configured provider needs an API key and model name. Optional base URL variables default to the official/compatible endpoints shown in `.env.example`.

```env
DISCORD_BOT_TOKEN=replace_with_discord_bot_token

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.0-flash

CLAUDE_API_KEY=
CLAUDE_MODEL=claude-3-5-haiku-latest

OPENROUTER_API_KEY=
OPENROUTER_MODEL=openai/gpt-4o-mini

AGENTROUTER_API_KEY=
AGENTROUTER_MODEL=your_agentrouter_model

SKILLS_DIR=./skills
TERMINAL_MODE=off
TERMINAL_CWD=./workspace
```

### Provider priority and fallback

The literal position of each `*_API_KEY=` line in `.env` controls priority:

1. The first non-empty API key from the top is tried first.
2. If its request fails, Igen tries the next non-empty API key below it.
3. Blank API keys are skipped.

For example, move `GEMINI_API_KEY=` above `OPENAI_API_KEY=` to make Gemini the primary provider. You may move the complete provider blocks to keep the file readable.

When keys are injected by Docker or the host and no `.env` ordering is available, the fallback order is OpenAI, Gemini, Claude, OpenRouter, then AgentRouter.

Gemini uses Google's OpenAI-compatible endpoint. Claude uses Anthropic's native Messages API. OpenAI, OpenRouter, and AgentRouter use OpenAI-compatible chat-completion requests.

## Optional Agentic Tool Integration

Igen works on its own with Node.js and Discord, but it is easier to improve over time with an agentic coding tool such as Hermes Agent, OpenClaw, Claude Code, Codex, or another terminal-capable assistant.

The repo includes Markdown skills for that workflow:

```text
agent-skills/igen-ai-discord-assistant-integration/SKILL.md
agent-skills/igen-ai-discord-skill-authoring/SKILL.md
```

Give those files to Hermes/OpenClaw-style agents when asking them to extend the bot. The integration skill explains the repo structure. The skill-authoring skill explains how an agent should read official Discord docs, add or patch YAML skills, run tests, and avoid per-action command files like `kick.js` or `ban.js`.

This integration is optional. You do not need Hermes or OpenClaw to run the bot.

## Skill Example

```yaml
skills:
  - name: moderation.timeout
    description: Timeout a Discord member for a duration in seconds.
    input_schema:
      type: object
      required: [guildId, targetUserId, durationSeconds, reason]
      properties:
        guildId: { type: string }
        targetUserId: { type: string }
        durationSeconds: { type: integer, minimum: 1, maximum: 2419200 }
        reason: { type: string }
    permissions:
      user: [ModerateMembers]
      bot: [ModerateMembers]
    safety:
      hierarchy: target_member
      confirmation_required: false
    discord:
      method: PATCH
      endpoint: /guilds/{guildId}/members/{targetUserId}
      audit_log_reason: "{{ reason }}"
      body:
        communication_disabled_until: "{{ timeoutUntilIso(durationSeconds) }}"
      success_status: [200]
```

## Adding Features

To add a moderation capability, add a new YAML skill. Avoid adding JavaScript command files unless the runtime itself needs a new executor type.

Good additions:

- `moderation.add_role`
- `moderation.remove_role`
- `moderation.set_role_permissions`
- `moderation.bulk_delete_messages`
- `moderation.prune_members`

For missing Discord actions, use `agent-skills/igen-ai-discord-skill-authoring/SKILL.md`: check existing skills, read the official Discord docs, add or patch the matching YAML file, run tests, then reload/restart before execution.

If a new feature cannot be expressed with the current YAML shape, improve the generic runtime first, then encode the feature as a skill.

## Terminal Tool

Terminal access is disabled by default.

```env
TERMINAL_MODE=off       # no terminal tool
TERMINAL_MODE=approval  # allow terminal.run, approval required for risky commands
TERMINAL_MODE=yolo      # run allowed commands without approval; dangerous
```

The terminal executor strips secrets from its environment, runs in `TERMINAL_CWD`, blocks obviously destructive commands, applies a timeout, and truncates output.

## Tests

```bash
npm test
```

Current tests cover:

- YAML skill loading
- duplicate skill rejection
- LLM tool schema generation
- required input validation
- approval gate for destructive skills
- Discord REST request rendering
- terminal safety policy

## Current Limitations

- Hierarchy checks are represented in skill metadata but not fully implemented yet.
- Bot permission checks are represented in skill metadata but need full Discord role resolution.
- Approval UX is currently primitive: messages containing `approve` set the context approval flag.
- Mention-to-user-ID resolution is left to the model/user for now; the runtime expects exact IDs.

These are the next areas to improve while keeping the no-hardcoded-command design.
