# SQL Function Parity (MySQL -> PostgreSQL)

Stand: 2026-02-16

## Scope
Analyse und Umsetzung der Legacy-MySQL-Funktionen aus historischem SQL-Bestand.

Ziel: SQL-Funktionslogik aus der Datenbank in TypeScript verlagern und testbar machen.

## Aktueller Stand
- Es gibt keine Laufzeitaufrufe der alten SQL-Funktionen im Anwendungscode (`src/`).
- Die fachliche Logik ist in `/Users/christian/shortbox/shortbox-graphql/src/util/dbFunctions.ts` zentral umgesetzt.
- Paritätstests liegen in `/Users/christian/shortbox/shortbox-graphql/tests/dbFunctions.test.ts`.
- Die ehemalige Datei `sql/functions.sql` wurde entfernt.

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
- Einordnung der Legacy-Dateien ist in `/Users/christian/shortbox/shortbox-graphql/sql/README.md` dokumentiert.
