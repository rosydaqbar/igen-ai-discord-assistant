export function renderTemplate(value, args) {
  if (typeof value === 'string') return renderString(value, args);
  if (Array.isArray(value)) return value.map((item) => renderTemplate(item, args));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renderTemplate(item, args)]));
  }
  return value;
}

function renderString(template, args) {
  const wholeExpression = template.match(/^\s*{{\s*(.*?)\s*}}\s*$/);
  if (wholeExpression) return evaluateExpression(wholeExpression[1], args);

  return template.replace(/\{([^{}]+)\}/g, (_, key) => String(args[key] ?? ''))
    .replace(/{{\s*(.*?)\s*}}/g, (_, expression) => String(evaluateExpression(expression, args) ?? ''));
}

function evaluateExpression(expression, args) {
  const timeoutMatch = expression.match(/^timeoutUntilIso\(([^)]+)\)$/);
  if (timeoutMatch) {
    const seconds = Number(args[timeoutMatch[1].trim()]);
    return new Date(Date.now() + seconds * 1000).toISOString();
  }
  return args[expression.trim()];
}
