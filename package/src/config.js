import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ChronoError } from './errors.js';

function scalar(value) {
  const trimmed = value.trim();
  if (trimmed === '') return {};
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1).split(',').map(item => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  }
  return trimmed.replace(/^['"]|['"]$/g, '');
}

export function parseConfig(text) {
  try { return JSON.parse(text); } catch {}
  const root = {};
  const stack = [{ indent: -1, value: root }];
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
    const indent = raw.match(/^ */)[0].length;
    if (indent % 2 !== 0) throw new ChronoError('INVALID_CONFIG', `YAML indentation must use pairs of spaces (line ${index + 1}).`);
    const match = /^\s*([^:#]+):(?:\s*(.*))?$/.exec(raw);
    if (!match) throw new ChronoError('INVALID_CONFIG', `Unsupported YAML syntax on line ${index + 1}.`);
    while (stack.at(-1).indent >= indent) stack.pop();
    const parent = stack.at(-1)?.value;
    if (!parent || Array.isArray(parent)) throw new ChronoError('INVALID_CONFIG', `Invalid YAML structure on line ${index + 1}.`);
    const key = match[1].trim();
    const value = scalar(match[2] ?? '');
    parent[key] = value;
    if (value && typeof value === 'object' && !Array.isArray(value)) stack.push({ indent, value });
  }
  return root;
}

export async function loadChronoConfig(root, filename = '.chronolab.yaml') {
  const file = path.resolve(root, filename);
  let text;
  try { text = await readFile(file, 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT') throw new ChronoError('CONFIG_NOT_FOUND', `ChronoLab config not found: ${file}`);
    throw error;
  }
  const config = parseConfig(text);
  if (config.version !== 1 || !config.services || typeof config.services !== 'object') {
    throw new ChronoError('INVALID_CONFIG', 'ChronoLab config requires `version: 1` and a `services` map.');
  }
  for (const [name, service] of Object.entries(config.services)) {
    if (!['wall-clock', 'passive'].includes(service.control)) throw new ChronoError('INVALID_CONFIG', `Service ${name} requires control: wall-clock or passive.`);
  }
  return { config, file };
}
