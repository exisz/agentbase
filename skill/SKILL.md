---
name: vibase
description: "vibase — vibe-driven database for AI agents. Multi-vendor board CLI (Trello, Markdown). Zero dependencies."
---

# vibase — Vibase CLI Skill

Use `vibase` CLI for board/card operations. Zero-dependency Node.js CLI supporting Trello and local Markdown backends.

## Setup

```bash
npm install -g @exisz/vibase
```

## Configuration

Place `.vibase/vibase.yml` in your project root (or `~/.vibase/`).

### Trello Vendor
```yaml
vendor: trello
trello:
  board_id: "your-board-id"
```

Environment variables required:
```bash
export TRELLO_KEY="your-trello-api-key"
export TRELLO_TOKEN="your-trello-api-token"
```

### Markdown Vendor
```yaml
vendor: markdown
markdown:
  dir: "./boards"    # relative to config location
```

Directory structure:
```
boards/
  board-name/
    list-name/
      card-slug.md   # YAML front matter + description body
```

## Common Patterns

### Listing
```bash
vibase boards                       # List boards
vibase lists                        # List all lists on configured board
vibase lists -b BOARD_ID            # List lists on specific board
vibase labels                       # List labels
vibase cards                        # List all cards
vibase cards -l LIST_ID             # Cards in a specific list
vibase card CARD_ID                 # Show card details
```

### Creating & Updating
```bash
vibase card:create -l LIST_ID -n "Card Name" -d "Description" --due 2025-01-01 --label bug
vibase card:update CARD_ID -n "New Name" -d "New desc" --due 2025-02-01
vibase card:move CARD_ID LIST_ID    # Move card to list
vibase card:archive CARD_ID         # Archive card
vibase card:comment CARD_ID "Comment text"
```

### Upsert (Killer Feature)
```bash
vibase upsert --key "unique-key" -l LIST_ID -n "Card Name" -d "Description"
```

If the key exists in `.vibase/managed.yaml` → **UPDATE** the existing card.
If the key doesn't exist → **CREATE** a new card and register it.

This prevents agents from creating duplicate cards on every run.

### Managed Records
```bash
vibase managed                      # Show all managed records (key → card mapping)
vibase sync                         # Sync managed.yaml with remote state
```

### Snapshots
```bash
vibase snapshot                     # Export board to board-snapshot.yaml
vibase snapshot -o ./my-snapshot.yaml
```

### Migration from Legacy
```bash
vibase migrate:from-trello-yaml ./trello.yaml
```

Imports records from old `trello.yaml` format into `.vibase/managed.yaml` and creates a basic config.

## Key Files

| File | Purpose |
|------|---------|
| `.vibase/vibase.yml` | Config (vendor, board_id, etc.) |
| `.vibase/managed.yaml` | Dedup registry (key → remote card ID) |

## Key Features

- **Zero runtime dependencies** — pure Node.js built-ins only
- **Upsert dedup** — prevents duplicate cards across agent runs
- **Multi-vendor** — Trello API + local Markdown files
- **Config walk** — searches current dir → parent dirs → `~/.vibase/`
- **Snapshot export** — dump entire board to YAML for version control

## Vendor Comparison

| Feature | Trello | Markdown |
|---------|--------|----------|
| Remote API | ✅ | ❌ (local files) |
| Collaboration | ✅ | Via git |
| Offline | ❌ | ✅ |
| Labels | ✅ (color) | ✅ (name only) |
| Comments | ✅ | ✅ (appended to file) |

## ⚠️ Deprecation Notice

- `board` CLI is **deprecated**. Use `vibase` instead.
- `agentfile` CLI is **deprecated**. Use `vibase` instead.
- Per-workspace `trello.yaml` files should be migrated: `vibase migrate:from-trello-yaml ./trello.yaml`
