---
name: igen-ai-discord-assistant-integration
description: Use when an agent such as Hermes Agent or OpenClaw needs to integrate with, extend, operate, or improve the Igen AI Discord Assistant repository while preserving its data-driven skill runtime design.
version: 1.0.0
author: Igen AI Discord Assistant
license: MIT
metadata:
  hermes:
    tags: [discord, moderation, agentic-tools, hermes, openclaw, nodejs]
    related_skills: []
---

# Igen AI Discord Assistant Integration

## Overview

Igen AI Discord Assistant is designed to work as a normal standalone Discord bot, but it becomes more useful when paired with agentic development tools such as Hermes Agent, OpenClaw, Claude Code, Codex, or other terminal-capable coding agents.

This agent skill explains how to extend and operate the repository while preserving the core design: moderation behavior belongs in YAML skill packs, while JavaScript implements only generic runtime capabilities.

The goal is adaptation. When the bot needs a new moderation feature, safety rule, executor type, or integration, the agent should improve the generic runtime or add a data-defined skill instead of creating one-off Discord command files.

## When to Use

Use this skill when asked to:

- Add new Discord moderation capabilities.
- Add or modify YAML skill packs in `skills/`.
- Improve the generic skill runtime in `src/runtime/`.
- Improve Discord REST execution in `src/discord/`.
- Improve LLM tool-calling behavior in `src/llm/`.
- Add safer terminal/tool capabilities.
- Debug failed skill execution.
- Prepare the bot for deployment.
- Keep the bot compatible with Hermes, OpenClaw, or similar agents.

Do not use this skill for:

- Creating per-action files like `kick.js`, `ban.js`, `timeout.js`.
- Hardcoding a single server's policy into the runtime.
- Adding secrets to the repository.
- Bypassing Discord permission, hierarchy, or approval checks.

## Repository Map

```text
skills/
  discord-moderation/
    core.yaml                 # inspect/list helper skills
    members.yaml              # timeout/kick/ban/unban skills
    messages.yaml             # single and bulk message deletion skills
    roles.yaml                # role create/edit/delete/assign skills
    channels.yaml             # channel create/edit/delete skills
    voice.yaml                # voice move/disconnect/mute/deafen skills
    prune.yaml                # inactive member prune preview/execution skills
  terminal.yaml               # optional terminal tool definition

src/runtime/
  skillLoader.js             # loads YAML skills and exposes LLM tool schemas
  skillExecutor.js           # validates inputs, approval, permissions, and dispatches executors
  template.js                # renders endpoint/body templates from tool args

src/discord/
  restClient.js              # sends Discord REST requests with the bot token
  permissions.js             # caller permission checks; should grow into full role/hierarchy checks

src/llm/
  client.js                  # OpenAI-compatible model client
  toolLoop.js                # LLM -> tool call -> result -> final answer loop

src/terminal/
  executor.js                # optional guarded terminal executor
  policy.js                  # terminal allow/block/approval policy

test/
  *.test.js                  # Node test suite
```

## Core Design Rules

1. **No one-off moderation command files.** Do not add `commands/kick.js`, `commands/timeout.js`, etc.
2. **Moderation actions are YAML skills.** Add new Discord actions to the matching file under `skills/discord-moderation/` unless the current runtime cannot express the action.
3. **Runtime code is generic.** JavaScript should improve reusable capabilities: validation, templating, permission checks, hierarchy checks, executors, tool loop, logging, approval UX.
4. **Discord REST execution happens in Node.** The LLM chooses a skill; the Node runtime validates and calls Discord REST with `DISCORD_BOT_TOKEN`.
5. **Terminal is optional.** Use terminal tools for host/log/file/admin tasks, not for Discord moderation when a REST skill can do it directly.
6. **No secrets in commits.** `.env` stays local; `.env.example` contains placeholders only.
7. **Test behavior before changing runtime code.** Add or update tests before implementation.

## Adding a Discord Moderation Skill

Add a YAML item under the matching file in `skills/discord-moderation/`:

- `core.yaml`: inspect/list/read-only helpers.
- `members.yaml`: timeout, kick, ban, unban, member mutation.
- `messages.yaml`: delete message and bulk-delete message actions.
- `roles.yaml`: role creation/editing/deletion and role assignment.
- `channels.yaml`: channel creation/editing/deletion.
- `voice.yaml`: voice move/disconnect/mute/deafen.
- `prune.yaml`: inactive member pruning preview/execution.

```yaml
  - name: moderation.example_action
    description: Explain exactly what this Discord action does.
    input_schema:
      type: object
      required: [guildId, targetUserId, reason]
      properties:
        guildId: { type: string }
        targetUserId: { type: string }
        reason: { type: string }
    permissions:
      user: [ModerateMembers]
      bot: [ModerateMembers]
    safety:
      hierarchy: target_member
      confirmation_required: true
    discord:
      method: PATCH
      endpoint: /guilds/{guildId}/members/{targetUserId}
      audit_log_reason: "{{ reason }}"
      body:
        field_name: "{{ someArg }}"
      success_status: [200]
```

Required fields:

- `name`: stable tool name exposed to the LLM.
- `description`: clear user-facing description.
- `input_schema`: JSON-schema-like input contract.
- `permissions.user`: Discord permissions caller needs.
- `permissions.bot`: Discord permissions bot needs.
- `safety`: confirmation/hierarchy/bulk-action metadata.
- `discord.method`: HTTP method.
- `discord.endpoint`: Discord REST path template.
- `discord.body`: request body when the endpoint needs one.
- `discord.success_status`: expected HTTP success codes.

If the endpoint has no request body, omit `discord.body` entirely.

## When Runtime Changes Are Allowed

Modify JavaScript only when the YAML skill pack cannot express a legitimate reusable need.

Good runtime changes:

- Add support for new JSON schema validation keywords.
- Add query parameter omission for undefined optional values.
- Add role hierarchy checks.
- Add managed-role protection.
- Add bulk-action preview/approval flow.
- Add durable audit logs.
- Add a new executor type used by multiple skills.
- Add mention/name resolution before LLM tool calls.

Bad runtime changes:

- Hardcode `ban`, `kick`, or `timeout` branches.
- Hardcode one guild ID, one channel ID, or one server policy.
- Put Discord bot token or model key into source.
- Let the LLM directly decide to skip permissions.

## Agent Workflow

1. Read `README.md` and the relevant files in `src/` and `skills/`.
2. Identify whether the request is:
   - a YAML skill addition;
   - a generic runtime improvement;
   - documentation/setup;
   - deployment/configuration.
3. If changing runtime code, write or update tests first.
4. Run:

```bash
npm test
node --check src/index.js
node --check src/runtime/skillExecutor.js
node --check src/runtime/template.js
```

5. Commit with a clear message:

```bash
git add .
git commit -m "feat: describe change"
```

6. Push only when the user asked for remote updates.

## Hermes Integration Notes

Hermes can use this repository naturally because it has:

- terminal access for `npm test`, git, deployment, logs;
- file tools for YAML skill edits;
- memory/skills for reusable procedures;
- optional scheduled jobs for maintenance;
- platform tools for Discord/Telegram workflows.

Recommended Hermes usage:

```bash
hermes -w -s ./agent-skills/igen-ai-discord-assistant-integration/SKILL.md
```

If your Hermes version does not support loading a local skill path directly, paste this skill into the session or install/copy it into the user's Hermes skills directory.

## OpenClaw / Other Agent Notes

OpenClaw or another terminal-capable coding agent can use this file as project instructions. Give it:

- this `SKILL.md`;
- `README.md`;
- the requested change;
- a reminder to run `npm test` before committing.

The agent should treat YAML skill packs as the extension API and JavaScript runtime as the generic engine.

## Common Pitfalls

1. **Adding command files defeats the purpose.** If a change creates `kick.js` or `timeout.js`, it is probably wrong.
2. **Skipping approval metadata.** Destructive actions should set `confirmation_required: true`.
3. **Forgetting bot permissions.** The caller and bot both need permission checks.
4. **Ignoring hierarchy.** Permission bits are not enough for roles and members.
5. **Overusing terminal.** Discord moderation should go through the Node Discord REST executor.
6. **Letting optional fields become empty strings.** If an endpoint rejects empty optional values, improve the generic renderer instead of hacking one skill.
7. **Leaking secrets.** Never commit `.env`, logs containing tokens, or copied API keys.

## Verification Checklist

- [ ] New moderation capability is YAML-defined, not a one-off JS command.
- [ ] Required inputs are explicit in `input_schema.required`.
- [ ] Permissions and safety metadata are present.
- [ ] Discord method/path/body match the official Discord REST API.
- [ ] Runtime changes have tests.
- [ ] `npm test` passes.
- [ ] `node --check` passes for touched JS files.
- [ ] README/docs updated if setup or integration changed.
- [ ] No secrets committed.
