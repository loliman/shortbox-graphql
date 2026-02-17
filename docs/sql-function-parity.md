# SQL Function Parity (Legacy -> TypeScript)

Stand: 2026-02-16

## Scope
Analyse und Umsetzung der Legacy-SQL-Funktionen aus historischem Bestand.

Ziel: SQL-Funktionslogik aus der Datenbank in TypeScript verlagern und testbar machen.

## Aktueller Stand
- Es gibt keine Laufzeitaufrufe der alten SQL-Funktionen im Anwendungscode (`src/`).
- Die fachliche Logik ist in `/Users/christian/shortbox/shortbox-graphql/src/util/dbFunctions.ts` zentral umgesetzt.
- Paritätstests liegen in `/Users/christian/shortbox/shortbox-graphql/tests/dbFunctions.test.ts`.
- Historische SQL-Funktionsdateien wurden entfernt.

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
- Kein offener Restpunkt fuer SQL-Funktionsparitaet.
- Legacy-SQL-Artefakte wurden aus dem Repository entfernt.
