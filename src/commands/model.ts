/**
 * `agentbase model {show,validate,declare,untracked}` — board-level
 * data-model operations driven by the template plugin system.
 */

import type { VendorAdapter } from '../types.js';
import { findById } from '../templates/loader.js';
import { validateBoardAgainstTemplate, validateTemplateSpec } from '../templates/validator.js';
import {
  buildBoardLite,
  readModelDeclaration,
  resolveTemplateId,
  ASSUMED_DEFAULT_TEMPLATE_ID,
} from '../templates/declaration.js';
import type { TemplateSpec } from '../templates/types.js';

interface ShowOpts {
  json?: boolean;
}

/**
 * agentbase model show -b <board>
 */
export async function cmdModelShow(
  adapter: VendorAdapter,
  boardId: string,
  opts: ShowOpts = {}
): Promise<void> {
  const { id, declared, declaration } = await resolveTemplateId(adapter, boardId);
  const rec = findById(id);

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          boardId,
          templateId: id,
          declared,
          declarationCardId: declaration?.cardId ?? null,
          template: rec ? rec.spec : null,
          source: rec?.source ?? null,
        },
        null,
        2
      ) + '\n'
    );
    return;
  }

  if (!rec) {
    console.log(`Board:    ${boardId}`);
    console.log(`Template: ${id} (${declared ? 'declared' : 'assumed default'})`);
    console.log('');
    console.log(`⚠️  Template "${id}" not found in registry.`);
    console.log(`   Install via: agentbase template install agentbase-template-${id}`);
    process.exit(2);
  }

  const spec = rec.spec;
  console.log(`Board:    ${boardId}`);
  console.log(
    `Template: ${spec.id} (v${spec.version}) — source: ${rec.source}` +
      (declared ? '' : `  [assumed default; no 🧬 DATA MODEL card found]`)
  );
  console.log(`Name:     ${spec.name}`);
  if (spec.description) {
    console.log('');
    console.log(spec.description.trim());
  }
  console.log('');
  console.log('Axes:');
  console.log(`  X (cards within a list): ${spec.axes.x.represents}`);
  console.log(`  Y (lists, left→right):   ${spec.axes.y.represents}`);
  console.log(`  Z (per-card status):     ${spec.axes.z.represents}`);
  if (spec['status-schema']) {
    console.log('');
    console.log(`Status (location: ${spec['status-schema'].location}):`);
    for (const v of spec['status-schema'].values) {
      const e = v.emoji ? `${v.emoji} ` : '';
      console.log(`  ${e}${v.key.padEnd(20)} ${v.meaning}`);
    }
  }
  if (spec['required-lists'] && spec['required-lists'].length > 0) {
    console.log('');
    console.log('Required lists:');
    for (const r of spec['required-lists']) {
      const min = r['min-count'] ?? 0;
      const max = r['max-count'] === null || r['max-count'] === undefined ? '∞' : r['max-count'];
      console.log(`  - ${r.id} (${r.role}): /${r.pattern}/   min=${min} max=${max}`);
    }
  }
  if (declaration) {
    console.log('');
    console.log(`Declaration card: ${declaration.cardId}`);
  }
}

/**
 * agentbase model validate -b <board>
 */
export async function cmdModelValidate(
  adapter: VendorAdapter,
  boardId: string,
  opts: ShowOpts = {}
): Promise<void> {
  const { id, declared } = await resolveTemplateId(adapter, boardId);
  const rec = findById(id);
  if (!rec) {
    if (opts.json) {
      process.stdout.write(
        JSON.stringify({ ok: false, error: `template ${id} not found` }) + '\n'
      );
    } else {
      console.error(`Template "${id}" not found in registry.`);
    }
    process.exit(2);
  }
  const board = await buildBoardLite(adapter, boardId);
  const result = validateBoardAgainstTemplate(board, rec.spec);
  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (!result.ok) process.exit(1);
    return;
  }

  console.log(
    `Validating board ${boardId} against template ${id}` +
      (declared ? '' : ' (assumed default)')
  );
  if (result.findings.length === 0) {
    console.log('✅ PASS — no findings.');
    return;
  }
  for (const f of result.findings) {
    const icon = f.severity === 'error' ? '❌' : f.severity === 'warning' ? '⚠️ ' : 'ℹ️ ';
    console.log(`${icon} [${f.rule}] ${f.message}`);
  }
  if (!result.ok) {
    console.log('');
    console.log('FAIL — validation errors found.');
    process.exit(1);
  } else {
    console.log('');
    console.log('PASS (with warnings).');
  }
}

/**
 * agentbase model declare -b <board> -t <template-id>
 *
 * Creates the 🧬 DATA MODEL card on the board's first list using the
 * template's init.cards model card definition.
 */
export async function cmdModelDeclare(
  adapter: VendorAdapter,
  boardId: string,
  templateId: string
): Promise<void> {
  const rec = findById(templateId);
  if (!rec) {
    console.error(`Template "${templateId}" not found.`);
    process.exit(2);
  }
  const lists = await adapter.lists(boardId);
  if (lists.length === 0) {
    console.error(`Board ${boardId} has no lists. Add lists first or use 'agentbase init'.`);
    process.exit(1);
  }
  // Check if a model card already exists
  const existing = await readModelDeclaration(adapter, boardId);
  if (existing) {
    console.error(
      `Board already has a model declaration card (${existing.cardId}, template=${existing.templateId}).`
    );
    console.error('Edit it directly via the vendor UI or remove it first.');
    process.exit(1);
  }
  // Find the model card in init.cards
  const modelCard = rec.spec.init?.cards?.find(c => c.name.includes('🧬 DATA MODEL'));
  if (!modelCard) {
    console.error(`Template "${templateId}" has no init.cards model declaration.`);
    process.exit(2);
  }
  const desc = (modelCard.desc || '').trim();
  const created = await adapter.cardCreate({
    listId: lists[0].id,
    name: modelCard.name,
    desc,
    boardId,
  });
  console.log(`Created model declaration card: ${created.id}`);
  console.log(`Template: ${templateId}`);
  console.log('Run `agentbase model show -b <board>` to verify.');
}

/**
 * Internal helper used by tests and template info command.
 */
export function dumpTemplate(spec: TemplateSpec): void {
  const findings = validateTemplateSpec(spec);
  console.log(`Template: ${spec.id} (v${spec.version})`);
  console.log(`Name:     ${spec.name}`);
  if (spec.description) console.log(`Desc:     ${spec.description.trim().split('\n')[0]}`);
  console.log(`Axes X:   ${spec.axes?.x?.represents ?? '(missing)'}`);
  console.log(`Axes Y:   ${spec.axes?.y?.represents ?? '(missing)'}`);
  console.log(`Axes Z:   ${spec.axes?.z?.represents ?? '(missing)'}`);
  if (spec['status-schema']?.values) {
    console.log(`Statuses: ${spec['status-schema'].values.map(v => v.key).join(', ')}`);
  }
  if (findings.length > 0) {
    console.log('');
    console.log('Schema findings:');
    for (const f of findings) {
      const icon = f.severity === 'error' ? '❌' : '⚠️ ';
      console.log(`  ${icon} [${f.rule}] ${f.message}`);
    }
  }
}

// re-export for index.ts convenience
export { ASSUMED_DEFAULT_TEMPLATE_ID };
