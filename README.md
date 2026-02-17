# shortbox-graphql

GraphQL-Backend fuer Shortbox (Apollo Server, Express 5, Sequelize).

## Ueberblick

- Rolle: API-Backend fuer Shortbox
- Stack: Node.js, TypeScript, Apollo Server, Express 5, Sequelize, PostgreSQL
- Contract-Quelle: `@loliman/shortbox-contract`

## Voraussetzungen

- Node.js 20+
- npm 10+
- PostgreSQL 16+
- npm-Auth fuer GitHub Packages (`@loliman`)

## Installation

```bash
npm ci
```

## Lokale Entwicklung

```bash
npm run dev
```

Standard-URL: `http://localhost:4000/` (GraphQL via POST/OPTIONS)

## Wichtige Skripte

- `npm run dev`: Start mit Watch-Mode
- `npm run start`: Start ohne Watch-Mode
- `npm run format`: Prettier write fuer `src/**/*.ts`
- `npm run format:check`: Prettier check fuer `src/**/*.ts`
- `npm run lint`: ESLint auf `src/**/*.ts`
- `npm run typecheck`: TypeScript-Check ohne Emit
- `npm run test`: Unit-Tests
- `npm run test:integration`: Integrationstests (laufende PostgreSQL-Instanz erforderlich)
- `npm run test:ci`: Coverage + Integration
- `npm run build`: TypeScript-Build nach `dist/`
- `npm run serve`: Start aus `dist/app.js`
- `npm run docker:build`: Docker Image bauen
- `npm run docker:up`: App + DB via Docker Compose starten

## Projektstruktur

- `src/app.ts`: Einstiegspunkt
- `src/core/`: Server, Security, DB-Bootstrap, Runtime-Helfer
- `src/modules/`: Domains mit Schema, Resolvern und Models
- `src/services/`: Business-Logik
- `src/api/`: gemeinsame GraphQL-Bausteine
- `tests/`: Unit- und Integrationstests

## Umgebungsvariablen

Typische Basiswerte in `.env`:

```env
DB_NAME=shortbox
DB_USER=shortbox
DB_PASSWORD=shortbox
DB_HOST=localhost
DB_PORT=5432
PORT=4000
NODE_ENV=development
DB_BOOTSTRAP_SYNC=false
```

Weitere relevante Variablen:

- `SESSION_SECRET`
- `SESSION_COOKIE_NAME`
- `SESSION_COOKIE_SAME_SITE`
- `SESSION_COOKIE_SECURE`
- `SESSION_COOKIE_DOMAIN`
- `SESSION_TTL_SECONDS`
- `TRUST_PROXY`
- `CORS_ORIGIN`
- `CORS_ALLOW_ALL_ORIGINS`
- `CORS_FAIL_CLOSED`
- `CSRF_PROTECTION_ENABLED`
- `CSRF_COOKIE_NAME`
- `CSRF_HEADER_NAME`
- `GRAPHQL_BODY_LIMIT_BYTES`
- `LOG_LEVEL`
- `LOG_TO_FILES`
- `MOCK_MODE`
- `LOGIN_MAX_ATTEMPTS`
- `LOGIN_WINDOW_SECONDS`
- `LOGIN_LOCK_SECONDS`

## CI und Release

CI-Workflow:

- Datei: `.github/workflows/ci.yml`
- Trigger: Push + Pull Request auf `main`
- Ergebnis: Build-Artifact `shortbox-graphql-<version>.tar.gz` + Coverage-Artifact
- Zusatz: separater Integrationstest-Job mit PostgreSQL-Service

Release:

- Datei: `.github/workflows/release.yml`
- Trigger: Push auf `main` (inkl. Merge und Direkt-Push) oder manuell (`workflow_dispatch`)
- Verhalten:
  - Version-Bump aus PR-Labels (`major`, `minor`, `patch`, Default `minor`)
  - Commit + Tag `vX.Y.Z`
  - Build + Release-Bundle als Asset im GitHub Release

## Hinweise

- Der Contract liegt extern; es gibt hier kein lokales Contract-Codegen-Script.
- Runtime-Start in Produktion: `npm run serve` nach Build und Runtime-Dependency-Installation.
