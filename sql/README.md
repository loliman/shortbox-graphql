# SQL Legacy Artifacts

Dieses Verzeichnis enthaelt historische MySQL-Artefakte und ist nicht Teil des
aktuellen PostgreSQL-Runtime-Pfads.

## Dateien
- `shortbox_schema.sql`: historischer MySQL-Dump (Referenz, nicht aktiv genutzt)
- `apply-net-migration.sql`: Legacy-MySQL-Cleanup-Skript, das alte DB-Funktionen entfernt

## Aktueller Stand
- Aktive DB-Anbindung: PostgreSQL ueber Sequelize
- SQL-Funktionsparitaet: `/Users/christian/shortbox/shortbox-graphql/src/util/dbFunctions.ts`
