# SQL Function Parity (MySQL -> PostgreSQL)

Stand: 2026-02-16

## Scope
Analyse der Legacy-MySQL-Funktionen aus:
- `/Users/christian/shortbox/shortbox-graphql/sql/functions.sql`
- `/Users/christian/shortbox/shortbox-graphql/sql/apply-net-migration.sql`

Abgleich mit aktueller TypeScript-Implementierung in `src/` und Tests in `tests/`.

## Befund zur Laufzeitnutzung
Es gibt aktuell keine direkten Aufrufe der SQL-Funktionen im Anwendungscode (`src/`) oder Tests (`tests/`).
Die Funktionsnamen tauchen dort nicht auf; die Logik ist bereits teilweise in TypeScript nachgebaut.

## Paritätsmatrix
| SQL-Funktion | SQL-Verhalten (kurz) | Aktueller TS-Standort | Parität | Lücke | Migrationsentscheidung |
| --- | --- | --- | --- | --- | --- |
| `sortabletitle(title)` | lower-case, Artikel entfernen (`der/die/das/the`), Umlaute normalisieren, Non-Alnum entfernen | Kein direktes Pendant | `MISSING` | Kein Sort-Key-Generator mit gleichem Verhalten vorhanden | Neues Utility `sortableTitle()` in TS einführen und gezielt dort nutzen, wo sortierbare Normalform gebraucht wird |
| `toroman(inarabic)` | Integer -> römisch, Spezialfälle: `0 => N`, `>3999 => overflow` | `romanize()` in `/Users/christian/shortbox/shortbox-graphql/src/util/util.ts` | `PARTIAL` | Semantik weicht ab (kein `N`/`overflow`-Contract) | Roman-Konvertierung in ein dediziertes Utility mit dokumentiertem Zielverhalten überführen; Call-Sites vereinheitlichen |
| `fromroman(inroman)` | römisch -> Integer, invalid => `0` | `romanToNumber()` (lokal, privat) in `/Users/christian/shortbox/shortbox-graphql/src/services/IssueService.ts` | `PARTIAL` | Nur lokal verfügbar; kein zentraler, getesteter Ersatz mit Legacy-Contract | In zentrales Utility `fromRoman()` extrahieren und Tests für Invalid-/Edge-Cases ergänzen |
| `urlencode(str)` | RFC-ähnliches Percent-Encoding pro Byte | `encodeURIComponent(...)` in `/Users/christian/shortbox/shortbox-graphql/src/api/Node.ts` | `PARTIAL` | Kein expliziter Paritätstest gegen Legacy-Funktion; nur lokale Nutzung | Auf Standard-`encodeURIComponent` festlegen, Semantik dokumentieren, Utility/Test ergänzen |
| `createserieslabel(...)` | Serienlabel aus Titel/Name/Vol/Jahr/Publisher | `generateLabel()` in `/Users/christian/shortbox/shortbox-graphql/src/util/util.ts`; zusätzlich `createSeriesLabel()` in `/Users/christian/shortbox/shortbox-graphql/src/api/Node.ts` | `PARTIAL` | Zwei TS-Implementierungen, unterschiedliche Formatierung/Regeln | Label-Bildung zentralisieren (eine Quelle), Output-Format explizit festlegen und testen |
| `createissuelabel(...)` | Issue-Label inkl. Nummer, Format/Variant, optional Titel | `generateLabel()` in `/Users/christian/shortbox/shortbox-graphql/src/util/util.ts`; zusätzlich `createIssueLabel()` in `/Users/christian/shortbox/shortbox-graphql/src/api/Node.ts` | `PARTIAL` | Doppelte Implementierung; Details (z. B. optionaler Issue-Titel) nicht einheitlich | In zentrale Label-Utilities konsolidieren und Paritätstests hinzufügen |
| `createlabel(type, ...)` | Dispatcher für Publisher/Series/Issue-Label | Kein 1:1-Dispatcher; verteilt auf `generateLabel()` + Node-Helfer | `PARTIAL` | Kein einzelner, klarer API-Einstieg wie im SQL-Original | Optionalen TS-Dispatcher einführen oder bestehendes zentrales Label-API klar dokumentieren |
| `createurl(type, ...)` | URL-Pfad für Publisher/Series/Issue mit us/de Prefix | `createUrl()` in `/Users/christian/shortbox/shortbox-graphql/src/api/Node.ts` | `PARTIAL` | Nur lokal in einem Resolver; kein dediziertes Utility + Paritätstest | In gemeinsames URL-Utility extrahieren und gegen Legacy-Beispiele testen |

## Zusammenfassung
- Die SQL-Funktionen sind bereits fachlich teilweise nach TypeScript gewandert, aber nicht konsolidiert.
- Der größte funktionale Gap ist `sortabletitle` (aktuell fehlend).
- Die größten strukturellen Gaps sind doppelte Label-/URL-Logik und fehlende zentrale Contracts.

## Empfohlene Reihenfolge für Ablösung
1. Zentrale Utility-Module für Roman, Label, URL, Sort-Title definieren.
2. Alle Call-Sites (`Node`, Services) auf diese Utilities umstellen.
3. Paritätstests pro Legacy-Funktion (Happy Path + Edge Cases) ergänzen.
4. SQL-Funktionsskripte als deprecated markieren und anschließend entfernen.
