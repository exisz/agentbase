/**
 * Schema validator — checks a parsed template object against the agentbase
 * template schema. Lightweight, hand-rolled (no JSON Schema dep needed for
 * the bounded shape we accept).
 *
 * Also: validates a board snapshot against a template (required-lists,
 * model declaration card, status emoji conformance).
 */

import type {
  TemplateSpec,
  ValidationFinding,
  ValidationResult,
  RequiredList,
} from './types.js';

const VALID_LOCATIONS = new Set([
  'list-membership',
  'card-name-prefix',
  'card-desc-field',
  'label',
  'checklist',
]);

const VALID_STORAGE_MODES = new Set(['single', 'reference', 'duplicate']);

/**
 * Validate the template YAML structure itself. Returns a list of findings;
 * empty list = OK.
 */
export function validateTemplateSpec(spec: unknown): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const err = (rule: string, message: string, ctx?: Record<string, unknown>): void => {
    findings.push({ severity: 'error', rule, message, context: ctx });
  };
  const warn = (rule: string, message: string, ctx?: Record<string, unknown>): void => {
    findings.push({ severity: 'warning', rule, message, context: ctx });
  };

  if (!spec || typeof spec !== 'object') {
    err('shape', 'template must be an object');
    return findings;
  }
  const t = spec as Record<string, unknown>;

  // Required scalars
  if (!t.id || typeof t.id !== 'string') err('id', 'id is required and must be a string');
  else if (!/^[a-z0-9][a-z0-9-]*$/.test(t.id))
    err('id', `id "${t.id}" must be kebab-case (a-z, 0-9, hyphens)`);

  if (typeof t.version !== 'number' || !Number.isInteger(t.version) || t.version < 1)
    err('version', 'version must be a positive integer');

  if (!t.name || typeof t.name !== 'string') err('name', 'name is required');

  // Axes
  if (!t.axes || typeof t.axes !== 'object') {
    err('axes', 'axes (x, y, z) is required');
  } else {
    const axes = t.axes as Record<string, unknown>;
    for (const key of ['x', 'y', 'z']) {
      const ax = axes[key];
      if (!ax || typeof ax !== 'object') {
        err(`axes.${key}`, `axes.${key} is required`);
        continue;
      }
      const a = ax as Record<string, unknown>;
      if (!a.represents || typeof a.represents !== 'string')
        err(`axes.${key}.represents`, `axes.${key}.represents must be a string`);
    }
  }

  // status-schema
  const ss = t['status-schema'];
  if (!ss || typeof ss !== 'object') {
    err('status-schema', 'status-schema is required');
  } else {
    const s = ss as Record<string, unknown>;
    if (!s.location || typeof s.location !== 'string')
      err('status-schema.location', 'status-schema.location is required');
    else if (!VALID_LOCATIONS.has(s.location as string))
      err(
        'status-schema.location',
        `status-schema.location must be one of: ${[...VALID_LOCATIONS].join(', ')}`
      );

    if (!Array.isArray(s.values) || s.values.length === 0)
      err('status-schema.values', 'status-schema.values must be a non-empty array');
    else {
      const seen = new Set<string>();
      for (const v of s.values) {
        if (!v || typeof v !== 'object') {
          err('status-schema.values', 'each value must be an object');
          continue;
        }
        const vv = v as Record<string, unknown>;
        if (!vv.key || typeof vv.key !== 'string')
          err('status-schema.values', 'each value must have a string key');
        else if (seen.has(vv.key as string))
          err('status-schema.values', `duplicate status key: ${vv.key}`);
        else seen.add(vv.key as string);
        if (!vv.meaning || typeof vv.meaning !== 'string')
          warn('status-schema.values', `value ${vv.key} missing meaning`);
      }
    }
  }

  // card-storage (optional)
  const cs = t['card-storage'];
  if (cs && typeof cs === 'object') {
    const c = cs as Record<string, unknown>;
    if (c.mode && !VALID_STORAGE_MODES.has(c.mode as string))
      err(
        'card-storage.mode',
        `card-storage.mode must be one of: ${[...VALID_STORAGE_MODES].join(', ')}`
      );
    if (c.mode === 'reference' && !c['canonical-list-pattern'])
      warn(
        'card-storage.canonical-list-pattern',
        'card-storage.mode=reference should declare canonical-list-pattern'
      );
  }

  // required-lists (optional)
  const rl = t['required-lists'];
  if (rl !== undefined && !Array.isArray(rl)) {
    err('required-lists', 'required-lists must be an array');
  } else if (Array.isArray(rl)) {
    for (const r of rl) {
      if (!r || typeof r !== 'object') {
        err('required-lists', 'each required-list must be an object');
        continue;
      }
      const rr = r as Record<string, unknown>;
      if (!rr.id || typeof rr.id !== 'string')
        err('required-lists', 'each required-list needs id');
      if (!rr.pattern || typeof rr.pattern !== 'string')
        err('required-lists', `required-list ${rr.id} needs pattern`);
      else {
        try {
          new RegExp(rr.pattern as string);
        } catch (e) {
          err('required-lists', `required-list ${rr.id} has invalid regex: ${(e as Error).message}`);
        }
      }
    }
  }

  return findings;
}

/**
 * Convenience: throw if spec invalid.
 */
export function assertValidTemplate(spec: TemplateSpec): void {
  const findings = validateTemplateSpec(spec);
  const errors = findings.filter(f => f.severity === 'error');
  if (errors.length > 0) {
    const lines = errors.map(e => `  - [${e.rule}] ${e.message}`).join('\n');
    throw new Error(`Template ${(spec as TemplateSpec).id} invalid:\n${lines}`);
  }
}

/**
 * Validate a board (list of lists with names) against a template's
 * `required-lists` rules.
 */
export interface BoardLite {
  id: string;
  lists: { id: string; name: string }[];
  firstListFirstCard?: { id: string; name: string; desc: string } | null;
}

export function validateBoardAgainstTemplate(
  board: BoardLite,
  spec: TemplateSpec
): ValidationResult {
  const findings: ValidationFinding[] = [];

  // 1. required-lists
  for (const req of spec['required-lists'] || []) {
    const re = new RegExp(req.pattern);
    const matches = board.lists.filter(l => re.test(l.name));
    const min = req['min-count'] ?? 0;
    const max = req['max-count'] ?? null;
    if (matches.length < min) {
      findings.push({
        severity: 'error',
        rule: `required-list:${req.id}`,
        message: `Expected ≥${min} list(s) matching /${req.pattern}/, found ${matches.length}`,
      });
    }
    if (max !== null && matches.length > max) {
      findings.push({
        severity: 'error',
        rule: `required-list:${req.id}`,
        message: `Expected ≤${max} list(s) matching /${req.pattern}/, found ${matches.length}`,
      });
    }
  }

  // 2. model declaration card (if behaviour requires it)
  if (spec.behaviours?.['require-model-declaration-card']) {
    const card = board.firstListFirstCard;
    if (!card) {
      findings.push({
        severity: 'error',
        rule: 'model-declaration-card',
        message: 'First list has no first card; model declaration card missing',
      });
    } else if (!card.name.includes('🧬 DATA MODEL')) {
      findings.push({
        severity: 'error',
        rule: 'model-declaration-card',
        message: `First card "${card.name}" is not a model declaration (expected name to contain "🧬 DATA MODEL")`,
      });
    } else if (!card.name.includes(spec.id)) {
      findings.push({
        severity: 'warning',
        rule: 'model-declaration-card',
        message: `Model declaration card name does not mention template id "${spec.id}"`,
      });
    }
  }

  return {
    ok: findings.filter(f => f.severity === 'error').length === 0,
    template: spec.id,
    findings,
  };
}
