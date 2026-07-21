import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

export class SkillRegistry {
  constructor() {
    this.skills = new Map();
  }

  add(skill) {
    if (!skill?.name) throw new Error('Skill is missing name');
    if (this.skills.has(skill.name)) throw new Error(`Duplicate skill: ${skill.name}`);
    this.skills.set(skill.name, normalizeSkill(skill));
  }

  get(name) {
    const skill = this.skills.get(name);
    if (!skill) throw new Error(`Unknown skill: ${name}`);
    return skill;
  }

  all() {
    return [...this.skills.values()];
  }

  toTools() {
    return this.all().map((skill) => ({
      type: 'function',
      function: {
        name: skill.name,
        description: skill.description ?? '',
        parameters: skill.inputSchema ?? { type: 'object', properties: {} },
      },
    }));
  }
}

function normalizeSkill(skill) {
  return {
    ...skill,
    inputSchema: skill.input_schema ?? skill.inputSchema ?? { type: 'object', properties: {} },
  };
}

export async function loadSkillsFromDir(dir) {
  const registry = new SkillRegistry();
  const files = await findYamlFiles(dir);

  for (const file of files) {
    const doc = YAML.parse(await readFile(file, 'utf8')) ?? {};
    for (const skill of doc.skills ?? []) registry.add(skill);
  }
  return registry;
}

async function findYamlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findYamlFiles(fullPath));
      continue;
    }
    if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) files.push(fullPath);
  }

  return files.sort();
}
