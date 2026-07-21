---
name: igen-ai-discord-skill-authoring
description: Use when an agent needs to add, update, or repair Igen AI Discord Assistant YAML skills from official Discord API documentation, especially when a requested Discord moderation action is missing or incomplete.
version: 1.0.0
author: Igen AI Discord Assistant
license: MIT
metadata:
  hermes:
    tags: [discord, skills, yaml, api-docs, moderation, agentic-tools]
    related_skills: [igen-ai-discord-assistant-integration]
---

# Igen AI Discord Skill Authoring

## Overview

Igen can adapt by changing data-defined YAML skills instead of adding one JavaScript command file per Discord action. This skill tells an agent how to turn a missing moderation capability into a safe YAML skill.

The key workflow is:

```text
user request
  -> check existing skills
  -> read official Discord docs
  -> add or patch the matching YAML file
  -> run tests
  -> reload skills or restart the bot
  -> execute only after permissions/approval are satisfied
```

This is intended for Hermes, OpenClaw, or another coding agent with file, terminal, and web access. The live Discord bot should not silently rewrite its own repository without an explicit operator-approved workflow.

## When to Use

Use this skill when:

- a user asks for a Discord action that is not exposed as a current Igen skill;
- an existing YAML skill lacks a needed field;
- Discord API docs changed and a skill must be updated;
- runtime support is missing for a reusable YAML feature;
- the user asks how the bot can adapt or learn a new Discord action.

Do not use this skill to:

- invent endpoint behavior from memory;
- bypass confirmation for destructive actions;
- commit secrets;
- add `kick.js`, `ban.js`, `timeout.js`, or other per-action command files.

## Skill File Routing

Place new skills in the focused moderation file:

- `skills/discord-moderation/core.yaml`: read-only inspection/listing helpers.
- `skills/discord-moderation/members.yaml`: timeout, kick, ban, unban, member mutation.
- `skills/discord-moderation/messages.yaml`: single-message and bulk-message deletion.
- `skills/discord-moderation/roles.yaml`: role create/edit/delete, permission edits, role assignment.
- `skills/discord-moderation/channels.yaml`: channel create/edit/delete and permission overwrites.
- `skills/discord-moderation/voice.yaml`: move, disconnect, mute, deafen.
- `skills/discord-moderation/prune.yaml`: prune preview and execution.

If a new category becomes large, create a new YAML file under `skills/discord-moderation/`; the runtime loads nested YAML recursively.

## Documentation-First Workflow

1. Identify the requested Discord action in plain English.
2. Search existing skills:

```bash
rg "moderation\.|endpoint:|ManageChannels|ManageRoles" skills/discord-moderation test
```

3. If a matching skill exists, prefer patching it over adding a duplicate.
4. Read official Discord docs for the relevant endpoint:
   - Guild resource: `https://discord.com/developers/docs/resources/guild`
   - Channel resource: `https://discord.com/developers/docs/resources/channel`
   - Permissions: `https://discord.com/developers/docs/topics/permissions`
   - Audit log reason: `https://discord.com/developers/docs/resources/audit-log`
5. Extract only documented facts:
   - HTTP method;
   - endpoint path;
   - required path/query/body fields;
   - expected success status;
   - required caller/bot permissions;
   - audit log behavior;
   - hierarchy or Discord limitations.
6. Add or patch the YAML skill.
7. Update tests if the skill set or runtime behavior changed.
8. Run verification.
9. Commit/push only if the operator asked for repository updates.

## Example: Change Role Permission To Manage Channels

User request:

```text
change this role permission so it can manage channels
```

Agent reasoning:

- This is role management, so use `skills/discord-moderation/roles.yaml`.
- Discord role modification uses `PATCH /guilds/{guild.id}/roles/{role.id}`.
- Role permissions are a permissions bitfield string.
- `MANAGE_CHANNELS` is a Discord permission bit; the agent must calculate or ask for the final permission bitfield instead of guessing if it cannot derive the current role permissions.
- Caller and bot need `ManageRoles`; role hierarchy must allow the edit.

A reusable skill might be an existing `moderation.edit_role`, or a more targeted skill like:

```yaml
- name: moderation.set_role_permissions
  description: Set a Discord role's permissions bitfield. Use only after calculating the exact final permissions string.
  input_schema:
    type: object
    required: [guildId, roleId, permissions, reason]
    properties:
      guildId: { type: string }
      roleId: { type: string }
      permissions: { type: string }
      reason: { type: string }
  permissions:
    user: [ManageRoles]
    bot: [ManageRoles]
  safety:
    hierarchy: target_role
    confirmation_required: true
    dangerous_permissions_require_confirmation: true
  discord:
    method: PATCH
    endpoint: /guilds/{guildId}/roles/{roleId}
    audit_log_reason: "{{ reason }}"
    body:
      permissions: "{{ permissions }}"
    success_status: [200]
```

Important: do not just set permissions to the `MANAGE_CHANNELS` bit alone unless the user explicitly wants to replace all permissions. Usually the agent must fetch the current role, OR the user must provide the final bitfield, then add the target permission bit to the existing bitfield.

## YAML Skill Requirements

Each skill should include:

- `name`: stable function/tool name, usually `moderation.<verb_noun>`.
- `description`: direct description for the LLM.
- `input_schema.required`: all fields needed to safely execute.
- `input_schema.properties`: expected field types and bounds.
- `permissions.user`: caller permissions.
- `permissions.bot`: bot permissions.
- `safety.confirmation_required`: true for destructive, irreversible, broad, or privilege-changing actions.
- `safety.hierarchy`: `target_member` or `target_role` where relevant.
- `discord.method`: REST method.
- `discord.endpoint`: REST path template.
- `discord.audit_log_reason`: reason template for auditable actions.
- `discord.body`: request body only when the endpoint needs one.
- `discord.success_status`: official expected success status codes.

## Runtime Change Policy

Patch JavaScript only when the YAML system lacks reusable support.

Acceptable runtime improvements:

- add validation keywords used by multiple skills;
- omit undefined optional query/body values;
- support permission bitfield helpers;
- fetch current Discord objects before rendering a request;
- add hierarchy checks;
- reload the skill registry after safe file changes;
- add an operator approval queue for skill-writing.

Do not hardcode one action into runtime code.

## Verification Commands

Run these after any skill-authoring change:

```bash
npm test
node --check src/index.js
node --check src/runtime/skillLoader.js
node --check src/runtime/skillExecutor.js
node --check src/runtime/template.js
```

If only YAML or Markdown changed, `npm test` is still required because it verifies skill loading.

## Common Pitfalls

1. **Replacing a role's entire permission set accidentally.** Discord role `permissions` is the full bitfield, not a patch of one permission.
2. **Using names instead of IDs.** YAML skills should execute using exact Discord snowflake IDs.
3. **Skipping docs.** Discord endpoints and response codes vary; read the official docs before adding a skill.
4. **Forgetting audit log reason.** Auditable moderation should use `X-Audit-Log-Reason` through `discord.audit_log_reason`.
5. **Adding duplicate skills.** Search first; patch existing `moderation.edit_role` or similar when it already covers the action.
6. **Letting the live bot self-edit silently.** Skill-writing should be operator-approved and test-gated.

## Verification Checklist

- [ ] Existing skills checked before adding a new one.
- [ ] Official Discord docs checked.
- [ ] Skill placed in the correct YAML file.
- [ ] Required inputs are sufficient and not vague.
- [ ] Caller and bot permissions are listed.
- [ ] Safety metadata is present.
- [ ] Endpoint, method, body, and success codes match docs.
- [ ] Runtime code changed only for generic support.
- [ ] Tests pass.
- [ ] No secrets committed.
