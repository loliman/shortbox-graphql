# Database Migrations

Dieses Verzeichnis enthaelt versionierte DB-Migrationen mit `up`/`down`.

## Regeln

- Dateinamen muessen mit einer aufsteigenden numerischen ID beginnen, z. B. `202602130001_...`.
- Jede Migration exportiert genau zwei Funktionen:
  - `up(ctx)` fuer das Anwenden
  - `down(ctx)` fuer das Rueckgaengigmachen
- Migrationen werden in der Tabelle `SchemaMigration` protokolliert.

## Kommandos

- `npm run db:migrate`
- `npm run db:migrate:status`
- `npm run db:migrate:down`
