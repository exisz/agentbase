/**
 * Template types — the schema agentbase templates conform to.
 *
 * See ~/.openclaw/workspaces/nebula/agentbase-templates-design.md §5
 * for the full schema spec.
 */

export type CardStorageMode = 'single' | 'reference' | 'duplicate';
export type StatusLocation =
  | 'list-membership'
  | 'card-name-prefix'
  | 'card-desc-field'
  | 'label'
  | 'checklist';

export interface AxisSpec {
  represents: string;
  cardinality?: 'one' | 'many';
  ordered?: boolean;
  location?: StatusLocation; // z-axis only
}

export interface StatusValue {
  key: string;
  emoji?: string;
  meaning: string;
}

export interface StatusTransition {
  from: string | string[];
  to: string | string[];
}

export interface StatusSchema {
  location: StatusLocation;
  values: StatusValue[];
  transitions?: StatusTransition[];
}

export interface RequiredList {
  id: string;
  pattern: string; // regex source
  role: 'canonical-storage' | 'time-bucket' | 'terminal' | 'status' | 'category' | string;
  'min-count'?: number;
  'max-count'?: number | null;
}

export interface CardStorage {
  mode: CardStorageMode;
  'canonical-list-pattern'?: string;
  'reference-mechanism'?: string;
}

export interface InitCardSpec {
  list: string; // list name (as in init.lists)
  name: string;
  pos?: 'top' | 'bottom' | number;
  desc?: string;
  'desc-template'?: string; // path within template dir
}

export interface InitListSpec {
  name: string;
  pos?: number;
}

export interface InitSpec {
  lists?: InitListSpec[];
  cards?: InitCardSpec[];
}

export interface TemplateBehaviours {
  'forbid-card-move-between-rounds'?: boolean;
  'require-model-declaration-card'?: boolean;
  'duplicate-detection-by'?: string;
  'strict-hooks'?: boolean;
}

export interface TemplateHooks {
  'on-list-create'?: string;
  'on-card-move'?: string;
  'on-card-create'?: string;
  'on-correspondence-add'?: string;
  'on-validate'?: string;
}

export interface TemplateViews {
  default?: string; // path to view module, or 'builtin'
  [name: string]: string | undefined;
}

export interface TemplateSpec {
  id: string;
  version: number;
  name: string;
  description?: string;
  axes: {
    x: AxisSpec;
    y: AxisSpec;
    z: AxisSpec;
  };
  'card-storage'?: CardStorage;
  'status-schema': StatusSchema;
  'required-lists'?: RequiredList[];
  behaviours?: TemplateBehaviours;
  hooks?: TemplateHooks;
  views?: TemplateViews;
  init?: InitSpec;
}

export type TemplateSource = 'builtin' | 'user' | 'npm';

export interface TemplateRecord {
  spec: TemplateSpec;
  source: TemplateSource;
  path: string; // absolute path to template.yaml
}

export interface ValidationFinding {
  severity: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface ValidationResult {
  ok: boolean;
  template: string;
  findings: ValidationFinding[];
}

export interface ModelDeclaration {
  templateId: string;
  cardId: string;
  rawDesc: string;
  parsedAt: string;
}
