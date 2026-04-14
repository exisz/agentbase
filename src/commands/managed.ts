/**
 * Managed command — show all managed records
 */

import { loadManaged } from '../managed.js';
import { getVibaseDir } from '../config.js';

export async function cmdManaged(configDir: string): Promise<void> {
  const vibaseDir = getVibaseDir(configDir);
  const managed = loadManaged(vibaseDir);

  if (!managed.records || managed.records.length === 0) {
    console.log('No managed records.');
    return;
  }

  console.log(JSON.stringify(managed, null, 2));
}
