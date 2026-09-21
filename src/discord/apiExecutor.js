import { logger } from '../logger.js';

export class DiscordApiExecutor {
  constructor({ discordRest, permissionChecker, now = () => Date.now() }) {
    this.discordRest = discordRest;
    this.permissionChecker = permissionChecker;
    this.now = now;
  }

  async execute({ decision, context, requestText, targetUserIds = [] }) {
    const operation = decision.operation;
    const resolvedContext = {
      guildId: context.guildId,
      targetUserId: resolveSingleTarget(operation, targetUserIds),
    };

    const missing = (operation.requiredContext ?? []).filter(
      (key) =>
        resolvedContext[key] === undefined ||
        resolvedContext[key] === null ||
        resolvedContext[key] === '',
    );

    if (missing.length > 0) {
      return {
        handled: true,
        ok: false,
        needsClarification: true,
        message: clarificationForMissing(missing),
      };
    }

    if (this.permissionChecker && operation.permissions) {
      await this.permissionChecker.assertAllowed(operation, {}, context);
    }

    const path = renderPath(operation.path, resolvedContext);
    const bodyResult = resolveBody({
      operation,
      bodyField: decision.bodyField,
      clearProbability: decision.clearBodyFieldProbability,
      requestText,
      now: this.now,
    });

    if (bodyResult.needsClarification) {
      return {
        handled: true,
        ok: false,
        needsClarification: true,
        message: bodyResult.message,
      };
    }

    const response = await this.discordRest.request({
      method: operation.method,
      path,
      body: bodyResult.body,
      auditLogReason: buildAuditLogReason(context, requestText),
    });

    const expected = operation.successStatus ?? [200, 204];
    if (!expected.includes(response.status)) {
      throw new Error(
        'Discord REST failed for ' + operation.id + ': HTTP ' + response.status,
      );
    }

    logger.info(
      'Jev API execution: ' +
        operation.id +
        ' -> ' +
        operation.method +
        ' ' +
        path +
        ' HTTP ' +
        response.status,
    );

    return {
      handled: true,
      ok: true,
      status: response.status,
      operationId: operation.id,
      message: 'Done. Discord API returned HTTP ' + response.status + '.',
    };
  }
}

export function parseDurationSeconds(text) {
  const unitSeconds = {
    s: 1,
    sec: 1,
    secs: 1,
    second: 1,
    seconds: 1,
    detik: 1,
    m: 60,
    min: 60,
    mins: 60,
    minute: 60,
    minutes: 60,
    menit: 60,
    h: 3600,
    hr: 3600,
    hrs: 3600,
    hour: 3600,
    hours: 3600,
    jam: 3600,
    d: 86400,
    day: 86400,
    days: 86400,
    hari: 86400,
    w: 604800,
    week: 604800,
    weeks: 604800,
    minggu: 604800,
  };

  const pattern = /(\d+(?:\.\d+)?)\s*(seconds?|secs?|sec|s|detik|minutes?|mins?|min|m|menit|hours?|hrs?|hr|h|jam|days?|d|hari|weeks?|w|minggu)\b/gi;
  let total = 0;
  let matched = false;

  for (const match of text.matchAll(pattern)) {
    matched = true;
    total += Number(match[1]) * unitSeconds[match[2].toLowerCase()];
  }

  if (!matched || !Number.isFinite(total) || total <= 0) return null;
  return Math.round(total);
}

function resolveSingleTarget(operation, targetUserIds) {
  if (!(operation.requiredContext ?? []).includes('targetUserId')) return undefined;
  if (targetUserIds.length !== 1) return undefined;
  return targetUserIds[0];
}

function resolveBody({
  operation,
  bodyField,
  clearProbability,
  requestText,
  now,
}) {
  const base =
    operation.defaultBody === undefined
      ? undefined
      : structuredClone(operation.defaultBody);

  if (!(operation.bodyFields ?? []).length) {
    return { body: base };
  }

  if (!bodyField) {
    return {
      needsClarification: true,
      message:
        'I understand the Discord endpoint, but not which member field you want to change.',
    };
  }

  if (bodyField.valueType === 'relative_datetime_or_null') {
    const shouldClear = clearProbability >= 0.8;
    if (shouldClear) {
      return {
        body: {
          ...(base ?? {}),
          [bodyField.name]: null,
        },
      };
    }

    const durationSeconds = parseDurationSeconds(requestText);
    if (!durationSeconds) {
      return {
        needsClarification: true,
        message:
          'How long should the timeout last? For example: 30m, 2 hours, or 1 jam.',
      };
    }

    const value = new Date(now() + durationSeconds * 1000).toISOString();
    return {
      body: {
        ...(base ?? {}),
        [bodyField.name]: value,
      },
    };
  }

  throw new Error(
    'Unsupported generic API value type: ' + bodyField.valueType,
  );
}

function renderPath(template, values) {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (_, key) => {
    const value = values[key];
    if (value === undefined || value === null || value === '') {
      throw new Error('Missing Discord API path parameter: ' + key);
    }
    return encodeURIComponent(String(value));
  });
}

function clarificationForMissing(missing) {
  if (missing.includes('targetUserId')) {
    return 'Mention exactly one target user for this Discord action.';
  }
  return 'Missing required Discord context: ' + missing.join(', ');
}

function buildAuditLogReason(context, requestText) {
  const caller = context.callerUserId ?? 'unknown';
  return ('Igen request by ' + caller + ': ' + requestText).slice(0, 480);
}
