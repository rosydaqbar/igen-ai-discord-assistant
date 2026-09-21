# Jev Direct Discord API Routing

This branch moves Igen away from command-specific moderation implementations.

The target architecture is:

```text
Discord message
  -> Jev System One
  -> select an available Discord API operation
  -> generic context/value resolution
  -> permission and safety checks
  -> generic Discord REST client
  -> Discord API
```

## Core rule

Do not add action files such as:

- `timeout.js`
- `kick.js`
- `ban.js`
- `moveMember.js`

Do not require a new executable YAML skill for each Discord action either.

Capabilities should come from Discord API operation metadata. Jev decides which available API operation best matches the user's natural-language request.

## Current experimental slice

The initial catalog contains these Discord API operations:

- PATCH Modify Guild Member
- DELETE Remove Guild Member
- PUT Create Guild Ban
- DELETE Remove Guild Ban

The Modify Guild Member entry currently exposes `communication_disabled_until`, which allows the same generic endpoint path to apply or remove a timeout.

Examples:

```text
@Igen timeout @john for 1 hour
  -> Jev: PATCH Modify Guild Member
  -> Jev: communication_disabled_until
  -> generic duration resolver
  -> PATCH /guilds/{guildId}/members/{targetUserId}

@Igen remove @john's timeout
  -> Jev: PATCH Modify Guild Member
  -> Jev: communication_disabled_until
  -> Jev: clear field
  -> PATCH /guilds/{guildId}/members/{targetUserId}

@Igen kick @john
  -> Jev: DELETE Remove Guild Member
  -> DELETE /guilds/{guildId}/members/{targetUserId}

@Igen ban @john
  -> Jev: PUT Create Guild Ban
  -> PUT /guilds/{guildId}/bans/{targetUserId}
```

There are no timeout/kick/ban executor functions.

## Responsibility boundaries

### Jev

Jev owns semantic decisions:

- whether the request is a direct Discord API action
- which available API operation best matches the request
- which available request-body field represents the requested change
- whether the user intends to clear/unset that field
- confidence for operation selection

### Discord/runtime data

The runtime uses exact Discord data for:

- guild ID
- mentioned user ID
- caller ID
- caller permissions

Jev should not invent IDs.

### Generic resolvers

The runtime may resolve literal values when they have an objective representation.

Current example:

```text
"1 hour" -> 3600 seconds -> ISO timestamp
"2 jam"  -> 7200 seconds -> ISO timestamp
```

Resolvers should be based on value types, not Discord action names.

Good:

```text
relative_datetime_or_null
boolean
snowflake_from_mention
integer
channel_reference
role_reference
```

Avoid:

```text
timeoutResolver
kickResolver
banResolver
```

## Permission boundary

Jev never authorizes an action.

After Jev selects an API operation, the existing permission checker still verifies the caller's Discord permissions before REST execution.

A 99% Jev decision does not bypass permissions.

## LLM boundary

When Jev routing is enabled, mutating Discord YAML skills are removed from the conversational LLM's available tools.

The LLM may currently retain read-only GET skills for conversational questions that require server information.

Therefore:

```text
mutation -> Jev -> direct API executor

conversation/read-only -> LLM may continue to use read-only tools
```

This prevents a failed or incorrect Jev action route from silently executing the same mutation through the legacy LLM/YAML path.

## Why an API catalog still exists

Jev is a decision model, not an arbitrary JSON/code generator. It needs a defined choice set.

The catalog is not a command registry. It describes Discord API capabilities:

- operation ID
- HTTP method
- path template
- required context
- request-body fields
- value types
- permission metadata
- expected response status

Long term, this catalog should be generated or synchronized from a machine-readable Discord API specification/source rather than manually maintained as feature commands.

## Migration plan

1. Validate Jev routing on the initial member moderation operations.
2. Expand the API catalog by Discord resource area.
3. Add generic value resolvers for Discord snowflakes, roles, channels, booleans, integers, and other schema types.
4. Add generic confirmation/safety policy based on HTTP operation metadata.
5. Migrate read operations to the API catalog.
6. Remove mutating moderation YAML skills once catalog coverage is sufficient.
7. Remove the legacy YAML Discord execution path when all required Discord capabilities are catalog-driven.

Terminal tooling is separate from this migration and can keep its own execution model.
