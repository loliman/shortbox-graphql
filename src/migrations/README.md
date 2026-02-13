# Database Migrations

Dieses Verzeichnis enthaelt versionierte DB-Migrationen mit `up`/`down`.

## Regeln

- Dateinamen muessen mit einer aufsteigenden numerischen ID beginnen, z. B. `202602130001_...`.
- Jede Migration exportiert genau zwei Funktionen:
  - `up(ctx)` fuer das Anwenden
  - `down(ctx)` fuer das Rueckgaengigmachen
- Migrationen werden von Umzug `SequelizeStorage` in der Tabelle `SchemaMigration` protokolliert.

## Kommandos

- `npm run db:migrate` (Umzug `up`)
- `npm run db:migrate:down` (Umzug `down`)
- `npm run db:migrate:status` (Umzug `executed` + `pending`)
- direkt: `ts-node src/scripts/migrate.ts --help`
