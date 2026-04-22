/**
 * `agentbase template {ls,info,scaffold}` — registry-level operations.
 */

import { existsSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadAll, findById, loadFromPath } from '../templates/loader.js';
import { dumpTemplate } from './model.js';

export function cmdTemplateList(opts: { json?: boolean } = {}): void {
  const records = loadAll();
  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        records.map(r => ({
          id: r.spec.id,
          version: r.spec.version,
          name: r.spec.name,
          source: r.source,
          path: r.path,
        })),
        null,
        2
      ) + '\n'
    );
    return;
  }
  if (records.length === 0) {
    console.log('(no templates discovered)');
    return;
  }
  console.log(`Found ${records.length} template(s):`);
  console.log('');
  for (const r of records) {
    console.log(`  ${r.spec.id.padEnd(32)} v${r.spec.version}  [${r.source}]`);
    console.log(`    ${r.spec.name}`);
    if (r.spec.description) {
      console.log(`    ${r.spec.description.trim().split('\n')[0]}`);
    }
    console.log(`    ${r.path}`);
    console.log('');
  }
}

export function cmdTemplateInfo(idOrPath: string): void {
  // If looks like a path (./, /, contains .yaml), load from path
  const looksLikePath =
    idOrPath.startsWith('./') ||
    idOrPath.startsWith('/') ||
    idOrPath.startsWith('../') ||
    idOrPath.endsWith('.yaml') ||
    idOrPath.endsWith('.yml');
  if (looksLikePath) {
    const abs = resolve(idOrPath);
    if (!existsSync(abs)) {
      console.error(`File not found: ${abs}`);
      process.exit(1);
    }
    const rec = loadFromPath(abs);
    console.log(`Path:     ${rec.path}`);
    console.log(`Source:   filesystem (loaded directly)`);
    console.log('');
    dumpTemplate(rec.spec);
    return;
  }
  const rec = findById(idOrPath);
  if (!rec) {
    console.error(`Template "${idOrPath}" not found in registry.`);
    console.error(`Run 'agentbase template ls' to see installed templates.`);
    process.exit(1);
  }
  console.log(`Source:   ${rec.source}`);
  console.log(`Path:     ${rec.path}`);
  console.log('');
  dumpTemplate(rec.spec);
}

const SCAFFOLD_TEMPLATE = (id: string) =>
  `id: ${id}
version: 1
name: "${id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}"
description: |
  TODO: one-paragraph summary of when to use this template.

axes:
  x:
    represents: "TODO: what cards within a list mean"
    cardinality: many
  y:
    represents: "TODO: what each list means"
    cardinality: many
    ordered: true
  z:
    represents: "TODO: where per-card status lives"
    location: list-membership

card-storage:
  mode: single

status-schema:
  location: list-membership
  values:
    - key: todo
      emoji: "📝"
      meaning: "Not started"
    - key: done
      emoji: "✅"
      meaning: "Completed"

required-lists:
  - id: todo
    pattern: "^📝 To Do"
    role: status
    min-count: 1

behaviours:
  require-model-declaration-card: true

init:
  lists:
    - name: "📝 To Do"
      pos: 1
    - name: "✅ Done"
      pos: 2
  cards:
    - list: "📝 To Do"
      name: "🧬 DATA MODEL: ${id} (read first)"
      pos: top
      desc: |
        # 🧬 Data Model: ${id}

        TODO: explain X, Y, Z axes; status values; how to use; why this model.
`;

export function cmdTemplateScaffold(id: string, opts: { out?: string } = {}): void {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    console.error(`Template id must be kebab-case (a-z, 0-9, hyphens), got: ${id}`);
    process.exit(1);
  }
  const yaml = SCAFFOLD_TEMPLATE(id);
  if (opts.out) {
    writeFileSync(opts.out, yaml);
    console.log(`Wrote scaffold to ${opts.out}`);
  } else {
    process.stdout.write(yaml);
  }
}
