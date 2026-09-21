import { readFile } from 'node:fs/promises';

const DEFAULT_CATALOG_URL = new URL('./apiCatalog.json', import.meta.url);

export async function loadDiscordApiCatalog(url = DEFAULT_CATALOG_URL) {
  const catalog = JSON.parse(await readFile(url, 'utf8'));
  validateCatalog(catalog);
  return catalog;
}

export function operationCriteria(catalog) {
  return Object.fromEntries(
    catalog.operations.map((operation) => [
      operation.id,
      operation.description + ' Endpoint: ' + operation.method + ' ' + operation.path,
    ]),
  );
}

export function bodyFieldCriteria(catalog) {
  const criteria = {
    none: 'No request body field is needed for the selected operation.',
  };

  for (const operation of catalog.operations) {
    for (const field of operation.bodyFields ?? []) {
      criteria[operation.id + ':' + field.name] =
        operation.id + ' field ' + field.name + ': ' + field.description;
    }
  }

  return criteria;
}

function validateCatalog(catalog) {
  if (!catalog || !Array.isArray(catalog.operations)) {
    throw new Error('Discord API catalog must contain an operations array');
  }

  const ids = new Set();
  for (const operation of catalog.operations) {
    if (!operation.id || !operation.method || !operation.path) {
      throw new Error('Discord API operation is missing id, method, or path');
    }
    if (ids.has(operation.id)) {
      throw new Error('Duplicate Discord API operation id: ' + operation.id);
    }
    ids.add(operation.id);
  }
}
