# SQL Function Parity (MySQL -> PostgreSQL)

Stand: 2026-02-16

## Scope
Analyse und Umsetzung der Legacy-MySQL-Funktionen aus:
- `/Users/christian/shortbox/shortbox-graphql/sql/functions.sql`
- `/Users/christian/shortbox/shortbox-graphql/sql/apply-net-migration.sql`

Ziel: SQL-Funktionslogik aus der Datenbank in TypeScript verlagern und testbar machen.

## Aktueller Stand
- Es gibt keine Laufzeitaufrufe der alten SQL-Funktionen im Anwendungscode (`src/`).
- Die fachliche Logik ist in `/Users/christian/shortbox/shortbox-graphql/src/util/dbFunctions.ts` zentral umgesetzt.
- Paritätstests liegen in `/Users/christian/shortbox/shortbox-graphql/tests/dbFunctions.test.ts`.
- `sql/functions.sql` ist als deprecated Stub markiert.
- `sql/apply-net-migration.sql` entfernt alte SQL-Funktionen aktiv (`DROP FUNCTION ...`) und erstellt sie nicht mehr neu.

## Paritätsmatrix
| SQL-Funktion | TS-Ersatz | Status |
| --- | --- | --- |
| `sortabletitle(title)` | `sortableTitle(title)` | `DONE` |
| `toroman(inarabic)` | `toRoman(input)` | `DONE` |
| `fromroman(inroman)` | `fromRoman(roman)` | `DONE` |
| `urlencode(str)` | `urlEncode(input)` | `DONE` |
| `createserieslabel(...)` | `createSeriesLabel(...)` | `DONE` |
| `createissuelabel(...)` | `createIssueLabel(...)` | `DONE` |
| `createlabel(type, ...)` | `createLabel(type, ...)` | `DONE` |
| `createurl(type, ...)` | `createUrl(type, ...)` | `DONE` |

## Restpunkte
- Historische MySQL-Dumps unter `sql/` bleiben als Referenz bestehen (nicht produktiv genutzt).
