/**
 * Model declaration parser — reads the pinned 🧬 DATA MODEL: <id> card
 * from a board's first list and extracts the template id.
 *
 * Also: derives the assumed default (status-pipeline) for boards lacking
 * a declaration.
 */

import type { Card, List, VendorAdapter } from '../types.js';
import type { ModelDeclaration } from './types.js';

const MODEL_CARD_NAME_RE = /🧬\s*DATA\s*MODEL[:：]\s*([a-z0-9-]+)/i;
export const ASSUMED_DEFAULT_TEMPLATE_ID = 'status-pipeline';

/**
 * Find the model declaration card in a board. Returns null if absent.
 */
export async function readModelDeclaration(
  adapter: VendorAdapter,
  boardId: string
): Promise<ModelDeclaration | null> {
  const lists = await adapter.lists(boardId);
  if (lists.length === 0) return null;

  // Sort lists by their natural position if possible; otherwise rely on order
  const firstList = lists[0];
  const cards = await adapter.cards(boardId, firstList.id);
  if (cards.length === 0) return null;

  // The declaration card should be at top — check first by position then by name match
  const sorted = [...cards].sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));
  for (const c of sorted) {
    const m = c.name.match(MODEL_CARD_NAME_RE);
    if (m) {
      return {
        templateId: m[1],
        cardId: c.id,
        rawDesc: c.desc || '',
        parsedAt: new Date().toISOString(),
      };
    }
  }
  return null;
}

/**
 * Derive the effective template id for a board: declared, or assumed default.
 */
export async function resolveTemplateId(
  adapter: VendorAdapter,
  boardId: string
): Promise<{ id: string; declared: boolean; declaration: ModelDeclaration | null }> {
  const decl = await readModelDeclaration(adapter, boardId);
  if (decl) return { id: decl.templateId, declared: true, declaration: decl };
  return { id: ASSUMED_DEFAULT_TEMPLATE_ID, declared: false, declaration: null };
}

/**
 * Build a lightweight board representation for validation.
 */
export async function buildBoardLite(
  adapter: VendorAdapter,
  boardId: string
): Promise<{
  id: string;
  lists: { id: string; name: string }[];
  firstListFirstCard: { id: string; name: string; desc: string } | null;
}> {
  const lists: List[] = await adapter.lists(boardId);
  let firstCard: Card | null = null;
  if (lists.length > 0) {
    const cards = await adapter.cards(boardId, lists[0].id);
    if (cards.length > 0) {
      firstCard = [...cards].sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0))[0];
    }
  }
  return {
    id: boardId,
    lists: lists.map(l => ({ id: l.id, name: l.name })),
    firstListFirstCard: firstCard
      ? { id: firstCard.id, name: firstCard.name, desc: firstCard.desc || '' }
      : null,
  };
}
