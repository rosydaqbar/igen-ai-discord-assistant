const PREFIX = '[Igen]';

const levels = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = levels.info;

function log(level, ...args) {
  if (levels[level] === undefined || levels[level] < currentLevel) return;
  const prefix = `${PREFIX}[${level.toUpperCase()}]`;
  if (level === 'error') {
    console.error(prefix, ...args);
  } else if (level === 'warn') {
    console.warn(prefix, ...args);
  } else {
    console.log(prefix, ...args);
  }
}

export const logger = {
  debug: (...args) => log('debug', ...args),
  info: (...args) => log('info', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args),
};
