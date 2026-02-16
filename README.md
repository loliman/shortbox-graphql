# shortbox-graphql

GraphQL-Backend fuer Shortbox auf Basis von Apollo Server, Express 5 und Sequelize.

## Ueberblick

- Laufzeit: Node.js + TypeScript
- API: GraphQL (Apollo Server)
- DB: MySQL (Sequelize)
- Contract: externes Paket `@loliman/shortbox-contract` (Schema + Typen)

## Projektstruktur

- `src/app.ts`: Einstiegspunkt
- `src/core/`: Server, Security, DB-Bootstrap, Runtime-Helfer
- `src/modules/`: Domainen (Schema/Resolver/Model je Modul)
- `src/services/`: Business-Logik
- `src/api/`: gemeinsame GraphQL-Bausteine
- `tests/`: Unit- und Integrationstests
- `sql/`: SQL-Artefakte (`functions.sql`, `shortbox_schema.sql`, `apply-net-migration.sql`)

## Voraussetzungen

- Node.js 20+
- npm 10+
- MySQL 8+
- Zugriff auf `@loliman` GitHub Package Registry (via `.npmrc`)

## Schnellstart (lokal)

1. Dependencies installieren:

```bash
npm ci
```

2. `.env` setzen (Beispielwerte sind im Repo vorhanden):

```env
DB_NAME=shortbox
DB_USER=shortbox
DB_PASSWORD=shortbox
DB_HOST=localhost
DB_PORT=3306
PORT=4000
NODE_ENV=development
DB_BOOTSTRAP_SYNC=false
```

3. Dev-Server starten:

```bash
npm run dev
```

Die GraphQL-API laeuft standardmaessig auf `http://localhost:4000/` (POST/OPTIONS).

## Wichtige Skripte

- `npm run dev`: Start mit Watch-Mode
- `npm run start`: Start ohne Watch-Mode
- `npm run lint`: ESLint auf `src/**/*.ts`
- `npm run typecheck`: TypeScript-Check ohne Emit
- `npm run test`: Unit-Tests
- `npm run test:integration`: Integrationstests
- `npm run test:ci`: Coverage + Integration
- `npm run build`: TypeScript Build nach `dist/`
- `npm run serve`: Start aus `dist/app.js`
- `npm run docker:build`: Docker Image bauen
- `npm run docker:up`: App + DB via Docker Compose starten

## Konfiguration (Auszug)

Zusatzvariablen fuer Security/Runtime:

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

## Contract-Quelle

Der GraphQL-Contract ist **externisiert** und wird zur Laufzeit aus `@loliman/shortbox-contract` geladen:

- SDL: `@loliman/shortbox-contract/schema/shortbox.graphql`
- Typen: `@loliman/shortbox-contract` (z. B. in `src/types/graphql.ts`)

Es gibt in diesem Repo **kein lokales Contract-Codegen** mehr.

## CI/CD

Die Pipeline in `.github/workflows/ci.yml` fuehrt aus:

- Install
- Lint
- Typecheck
- Unit-Tests (Coverage-Gate)
- Build
- Integrationstests mit MySQL-Service
- SonarCloud-Analyse

