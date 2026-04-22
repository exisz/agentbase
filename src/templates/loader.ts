/**
 * Template loader — discovers and parses templates from three sources:
 *   1. built-in (bundled in dist/templates/builtin/*.yaml)
 *   2. user filesystem (~/.agentbase/templates/*.yaml)
 *   3. npm packages (node_modules/{@scope/}agentbase-template-* )
 *
 * Resolution order: built-in → user → npm. First-seen id wins; collisions
 * emit a warning to stderr.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { parseYaml } from '../yaml.js';
import type { TemplateRecord, TemplateSpec, TemplateSource } from './types.js';

const NPM_PREFIX_RE = /^(?:@[^/]+\/)?agentbase-template-[a-z0-9-]+$/;
const TEMPLATE_FILES = ['template.yaml', 'template.yml', 'template/index.yaml'];

let cache: TemplateRecord[] | null = null;

/**
 * Force a fresh discovery on next loadAll().
 */
export function invalidateCache(): void {
  cache = null;
}

/**
 * Load and parse a single YAML file as a TemplateSpec.
 * Throws on parse errors. Does NOT validate the schema (validator does that).
 */
export function loadTemplateFile(path: string): TemplateSpec {
  const raw = readFileSync(path, 'utf-8');
  const parsed = parseYaml(raw) as unknown as TemplateSpec;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Template ${path} is not a valid YAML object`);
  }
  if (!parsed.id) {
    throw new Error(`Template ${path} missing required field: id`);
  }
  return parsed;
}

/**
 * Locate the built-in template directory. Works in both `src/` (during tests)
 * and `dist/` (after build). In CJS, __dirname is the directory of this file.
 */
function getBuiltinDir(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const here: string = (typeof __dirname !== 'undefined') ? __dirname : process.cwd();
  return join(here, 'builtin');
}

function listYamlFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map(f => join(dir, f));
}

/**
 * Discover npm-installed template packages. Walks node_modules from cwd up.
 * Also checks the global node_modules.
 */
function discoverNpmTemplates(): { path: string; pkgName: string }[] {
  const roots = new Set<string>();
  let dir = process.cwd();
  while (true) {
    const nm = join(dir, 'node_modules');
    if (existsSync(nm)) roots.add(nm);
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Global
  const globalNm = process.env.npm_config_prefix
    ? join(process.env.npm_config_prefix, 'lib', 'node_modules')
    : join(homedir(), '.nvm', 'versions', 'node'); // best-effort fallback
  if (existsSync(globalNm)) {
    // For NVM, walk one level for nodeXX/lib/node_modules
    try {
      const entries = readdirSync(globalNm);
      for (const e of entries) {
        const candidate = join(globalNm, e, 'lib', 'node_modules');
        if (existsSync(candidate)) roots.add(candidate);
      }
    } catch {
      // ignore
    }
  }

  const results: { path: string; pkgName: string }[] = [];
  for (const nmRoot of roots) {
    let entries: string[] = [];
    try {
      entries = readdirSync(nmRoot);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.startsWith('@')) {
        // scoped
        let scopedEntries: string[] = [];
        try {
          scopedEntries = readdirSync(join(nmRoot, entry));
        } catch {
          continue;
        }
        for (const sub of scopedEntries) {
          const pkgName = `${entry}/${sub}`;
          if (!NPM_PREFIX_RE.test(pkgName)) continue;
          const pkgDir = join(nmRoot, entry, sub);
          const tpl = findTemplateEntry(pkgDir);
          if (tpl) results.push({ path: tpl, pkgName });
        }
      } else {
        if (!NPM_PREFIX_RE.test(entry)) continue;
        const pkgDir = join(nmRoot, entry);
        const tpl = findTemplateEntry(pkgDir);
        if (tpl) results.push({ path: tpl, pkgName: entry });
      }
    }
  }
  return results;
}

/**
 * Find the template entry file inside an installed package directory.
 * Honours `agentbase.template` in package.json, falls back to TEMPLATE_FILES.
 */
function findTemplateEntry(pkgDir: string): string | null {
  // Honour package.json agentbase.template
  const pkgJson = join(pkgDir, 'package.json');
  if (existsSync(pkgJson)) {
    try {
      const pj = JSON.parse(readFileSync(pkgJson, 'utf-8'));
      const declared = pj?.agentbase?.template;
      if (declared && typeof declared === 'string') {
        const p = resolve(pkgDir, declared);
        if (existsSync(p)) return p;
      }
    } catch {
      // ignore
    }
  }
  for (const candidate of TEMPLATE_FILES) {
    const p = join(pkgDir, candidate);
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

/**
 * Load all templates from all sources. Cached for the process lifetime.
 */
export function loadAll(): TemplateRecord[] {
  if (cache) return cache;

  const records: TemplateRecord[] = [];
  const seen = new Map<string, TemplateRecord>();

  const collect = (path: string, source: TemplateSource): void => {
    let spec: TemplateSpec;
    try {
      spec = loadTemplateFile(path);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`agentbase: skipping template ${path}: ${msg}\n`);
      return;
    }
    const rec: TemplateRecord = { spec, source, path };
    const prev = seen.get(spec.id);
    if (prev) {
      process.stderr.write(
        `agentbase: template id "${spec.id}" duplicated. Using ${prev.source}:${prev.path}, ignoring ${source}:${path}\n`
      );
      return;
    }
    seen.set(spec.id, rec);
    records.push(rec);
  };

  // 1. Built-in
  for (const p of listYamlFiles(getBuiltinDir())) collect(p, 'builtin');

  // 2. User
  const userDir = join(homedir(), '.agentbase', 'templates');
  for (const p of listYamlFiles(userDir)) collect(p, 'user');

  // 3. npm
  for (const { path } of discoverNpmTemplates()) collect(path, 'npm');

  cache = records;
  return cache;
}

/**
 * Look up a template by id across all sources. Returns null if not found.
 */
export function findById(id: string): TemplateRecord | null {
  return loadAll().find(r => r.spec.id === id) || null;
}

/**
 * Load a single template directly from a filesystem path (e.g. ./my-template.yaml).
 * Used by `agentbase template info <PATH>`.
 */
export function loadFromPath(path: string): TemplateRecord {
  const abs = resolve(path);
  const spec = loadTemplateFile(abs);
  return { spec, source: 'user', path: abs };
}
