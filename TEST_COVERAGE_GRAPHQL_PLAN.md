# GraphQL Testkonzept und Implementierungsplan

## Zielbild

- Primärziel: belastbare Backend-Tests mit `>= 80%` Coverage im definierten Scope.
- Sekundärziel: Fokus auf Kernlogik statt "stumpfer" Tests ohne Aussagekraft.
- Randbedingung: Coverage nur durch fachlich sinnvolle Tests erhöhen.

## Ausgangslage (14. Februar 2026)

- Es existiert bereits ein Jest-Stack für Unit- und Integrationstests.
- Bisheriger Coverage-Scope war auf wenige `core`-Dateien begrenzt.
- Viele produktive Module haben daher keinen oder wenig Testdruck im Coverage-Report.

## Testkonzept

### 1. Fokusmodule

- `core/*`: Security-, Request-, Config- und Initialisierungslogik.
- `util/*`: Branch-heavy Label-/Formatierungs- und Helper-Funktionen.
- `api/*`-Grundbausteine: Basisschema und Resolver-Wiring.

### 2. Qualitätskriterien

- Tests prüfen fachliches Verhalten und Edge-Cases.
- Error-/Fallback-Pfade werden explizit abgedeckt.
- Keine Netz-/DB-Abhängigkeit in Unit-Tests (Mocks statt echte Infrastruktur).

### 3. Rollout-Strategie

- Coverage-Scope schrittweise erweitern.
- Nach jeder Welle `test:coverage` und `test:ci` validieren.
- Erst danach nächste Modulpakete (z. B. Services/Resolver) aufnehmen.

## Implementierungsplan

### Phase 1: Core + Util Basis

- Neue Tests für:
  - `src/core/csrf.ts`
  - `src/core/database.ts`
  - `src/core/migrations.ts`
  - `src/api/generic.ts`
  - `src/util/util.ts` (insb. `generateLabel`, `asyncForEach`)
- `collectCoverageFrom` um diese Dateien erweitern.

### Phase 2: Service-Logik

- Branch-heavy Servicepfade gezielt testbar machen (Mocks für Modelle/Sequelize).
- Priorität: `UserService`, `IssueService`, `FilterService`.

### Phase 3: Resolver- und Integrationsschicht

- Resolver-Tests mit Service-Mocks für Fehler- und Edge-Handling.
- Integrationstests nur für kritische End-to-End-Datenflüsse.

## Umsetzungsstand

- Phase 1: Welle 1 umgesetzt.
  - Neue Tests:
    - `tests/util.generateLabel.test.ts`
    - `tests/core/csrf.test.ts`
    - `tests/core/database.test.ts`
    - `tests/core/migrations.test.ts`
    - `tests/core/generic.test.ts`
  - Coverage-Scope erweitert in `jest.config.js` um:
    - `src/api/generic.ts`
    - `src/core/csrf.ts`
    - `src/core/database.ts`
    - `src/core/migrations.ts`
    - `src/util/util.ts`
- Messstand nach Welle 1 (14. Februar 2026):
  - `npm run test:coverage`: Statements `96.51%`, Branches `86.75%`, Functions `100%`, Lines `97.97%`.
  - `npm run test:ci`: Unit-Teil grün; Integrationstests aktuell blockiert durch fehlendes Modul `@loliman/shortbox-contract/schema/shortbox.graphql` in lokaler Umgebung.
- Phase 2: Welle 1 umgesetzt.
  - Neue Tests:
    - `tests/FilterService.test.ts`
  - Coverage-Scope erweitert in `jest.config.js` um:
    - `src/services/FilterService.ts`
- Phase 2: Welle 2 umgesetzt.
  - Neue Tests:
    - `tests/core/cleanup.test.ts`
  - Coverage-Scope erweitert in `jest.config.js` um:
    - `src/core/cleanup.ts`
- Messstand nach Phase 2, Welle 2 (14. Februar 2026):
  - `npm run test:coverage`: Statements `95.42%`, Branches `80.19%`, Functions `98.7%`, Lines `99.17%`.
  - SonarCloud Branch `upgrade` (`loliman_shortbox-graphql`):
    - `new_coverage`: `3.9` -> `10.6` -> `23.7` -> `27.6` -> `30.4`.
  - Sonar-Konfiguration erweitert:
    - `sonar.coverage.exclusions=src/mock/**,src/migrations/**`
