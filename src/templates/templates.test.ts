/**
 * Tests for the template plugin system.
 *
 * Run after `npm run build` (the test runner reads dist/, which is where
 * built-in YAML files are copied).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAll, findById, loadFromPath } from './loader.js';
import {
  validateTemplateSpec,
  validateBoardAgainstTemplate,
  type BoardLite,
} from './validator.js';
import { join } from 'node:path';

// In CJS test build, __dirname resolves; the test runs against dist/.
const here: string = (typeof __dirname !== 'undefined') ? __dirname : process.cwd();

test('loadAll discovers built-in templates', () => {
  const records = loadAll();
  const ids = records.map(r => r.spec.id).sort();
  assert.ok(ids.includes('status-pipeline'), `expected status-pipeline; got ${ids.join(',')}`);
  assert.ok(
    ids.includes('correspondence-versioned'),
    `expected correspondence-versioned; got ${ids.join(',')}`
  );
});

test('findById returns a record with valid spec', () => {
  const rec = findById('correspondence-versioned');
  assert.ok(rec, 'correspondence-versioned not found');
  assert.equal(rec!.spec.id, 'correspondence-versioned');
  assert.equal(rec!.spec.version, 1);
  assert.equal(rec!.source, 'builtin');
});

test('built-in templates pass schema validation', () => {
  for (const rec of loadAll()) {
    const findings = validateTemplateSpec(rec.spec);
    const errors = findings.filter(f => f.severity === 'error');
    assert.equal(
      errors.length,
      0,
      `template ${rec.spec.id} has errors:\n${errors.map(e => `  ${e.rule}: ${e.message}`).join('\n')}`
    );
  }
});

test('schema validation catches missing id', () => {
  const findings = validateTemplateSpec({ version: 1, name: 'X' });
  const ids = findings.map(f => f.rule);
  assert.ok(ids.includes('id'), `expected id error; got ${ids.join(',')}`);
});

test('schema validation catches bad status location', () => {
  const findings = validateTemplateSpec({
    id: 'x',
    version: 1,
    name: 'X',
    axes: { x: { represents: 'a' }, y: { represents: 'b' }, z: { represents: 'c' } },
    'status-schema': { location: 'bogus', values: [{ key: 'a', meaning: 'A' }] },
  });
  const locErr = findings.find(f => f.rule === 'status-schema.location');
  assert.ok(locErr, 'expected status-schema.location error');
});

test('validateBoardAgainstTemplate: rffi-shaped board passes correspondence-versioned', () => {
  const rec = findById('correspondence-versioned');
  assert.ok(rec);
  const board: BoardLite = {
    id: 'rffi-mock',
    lists: [
      { id: 'l1', name: '📚 Item Library (canonical cards)' },
      { id: 'l2', name: '📨 Original Claim 1 May 2025' },
      { id: 'l3', name: '📨 RFFI #1 25 Mar 2026' },
      { id: 'l4', name: '✅ Closed Out' },
    ],
    firstListFirstCard: {
      id: 'c1',
      name: '🧬 DATA MODEL: correspondence-versioned (read first)',
      desc: 'see template plugin spec',
    },
  };
  const result = validateBoardAgainstTemplate(board, rec!.spec);
  assert.equal(
    result.ok,
    true,
    `expected pass; findings:\n${result.findings.map(f => `  [${f.rule}] ${f.message}`).join('\n')}`
  );
});

test('validateBoardAgainstTemplate: missing model card fails', () => {
  const rec = findById('correspondence-versioned');
  assert.ok(rec);
  const board: BoardLite = {
    id: 'mock',
    lists: [
      { id: 'l1', name: '📚 Item Library' },
      { id: 'l2', name: '📨 Round 1' },
    ],
    firstListFirstCard: { id: 'c1', name: 'Some random card', desc: '' },
  };
  const result = validateBoardAgainstTemplate(board, rec!.spec);
  assert.equal(result.ok, false);
  assert.ok(
    result.findings.some(f => f.rule === 'model-declaration-card' && f.severity === 'error'),
    'expected model-declaration-card error'
  );
});

test('validateBoardAgainstTemplate: missing required Library list fails', () => {
  const rec = findById('correspondence-versioned');
  assert.ok(rec);
  const board: BoardLite = {
    id: 'mock',
    lists: [{ id: 'l1', name: '📨 Round 1' }],
    firstListFirstCard: {
      id: 'c1',
      name: '🧬 DATA MODEL: correspondence-versioned',
      desc: '',
    },
  };
  const result = validateBoardAgainstTemplate(board, rec!.spec);
  assert.equal(result.ok, false);
  assert.ok(
    result.findings.some(f => f.rule === 'required-list:library'),
    'expected required-list:library error'
  );
});

test('loadFromPath loads a built-in YAML directly', () => {
  const path = join(here, 'builtin', 'status-pipeline.yaml');
  const rec = loadFromPath(path);
  assert.equal(rec.spec.id, 'status-pipeline');
});

test('status-pipeline status values include backlog and done', () => {
  const rec = findById('status-pipeline');
  assert.ok(rec);
  const keys = rec!.spec['status-schema'].values.map(v => v.key);
  assert.ok(keys.includes('backlog'));
  assert.ok(keys.includes('done'));
});
