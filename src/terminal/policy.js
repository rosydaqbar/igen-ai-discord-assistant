const blockedPatterns = [
  /\bsudo\b/,
  /\brm\s+-rf\s+\//,
  /\bmkfs(?:\.[a-z0-9]+)?\b/,
  /\bdd\s+if=/,
  /:\s*\(\)\s*\{\s*:\s*\|\s*:\s*&\s*}\s*;/,
  /\bchmod\s+-R\s+777\s+\//,
  /curl\b.*\|\s*(?:sh|bash)\b/,
  /wget\b.*\|\s*(?:sh|bash)\b/,
];

const approvalPatterns = [
  /\brm\b/,
  /\bmv\b/,
  /\bchmod\b/,
  /\bchown\b/,
  /\bnpm\s+install\b/,
  /\bpnpm\s+add\b/,
  /\byarn\s+add\b/,
  /\bapt(?:-get)?\s+install\b/,
  /\bpip\s+install\b/,
  /\bcurl\b/,
  /\bwget\b/,
];

export function shouldBlockCommand(command) {
  return blockedPatterns.some((pattern) => pattern.test(command));
}

export function requiresApproval(command) {
  return approvalPatterns.some((pattern) => pattern.test(command));
}
