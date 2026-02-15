# Security Environment Runbook

Single source of truth for security-relevant environment variables of the Shortbox stack.
This file covers backend (`shortbox-graphql`) and the required frontend coupling (`shortbox-react`).

## 1. Production baseline

Set the following as hard baseline for production:

- `NODE_ENV=production`
- `CORS_FAIL_CLOSED=true`
- `CORS_ORIGIN=<exact frontend origins, comma-separated>`
- `CORS_ALLOW_ALL_ORIGINS=false`
- `CSRF_PROTECTION_ENABLED=true`
- `SESSION_COOKIE_SECURE=true`
- `SESSION_COOKIE_SAME_SITE=Lax` (or `None` only for cross-site deployment with TLS)
- `SESSION_COOKIE_DOMAIN=<cookie domain for your deployment>`
- `VITE_API_CREDENTIALS=include` in frontend
- `VITE_CSRF_ENABLED=true` in frontend

## 2. Backend variables (shortbox-graphql)

### Authentication and session

| Variable | Default | Prod requirement | Purpose / risk |
|---|---|---|---|
| `SESSION_COOKIE_NAME` | `sb_session` | Must be explicit if multiple apps share domain | Name of auth session cookie. |
| `SESSION_COOKIE_MAX_AGE_SECONDS` | `1209600` | Review explicitly | Browser cookie lifetime. |
| `SESSION_TTL_SECONDS` | `1209600` | Review explicitly | Server-side session expiration. |
| `SESSION_REFRESH_THRESHOLD_SECONDS` | `43200` | Review explicitly | Auto-extension threshold for active sessions. |
| `SESSION_COOKIE_SAME_SITE` | `lax` | Must be explicit | CSRF/cross-site behavior (`Lax`, `Strict`, `None`). |
| `SESSION_COOKIE_SECURE` | `false` unless production auto-secure | Must be `true` in production | Prevents cookie transport over HTTP. |
| `SESSION_COOKIE_DOMAIN` | unset | Should be explicit in production | Cookie scoping across subdomains. |
| `SESSION_RETENTION_DAYS` | `30` | Review explicitly | Retention of revoked sessions in cleanup. |

### CSRF protection

| Variable | Default | Prod requirement | Purpose / risk |
|---|---|---|---|
| `CSRF_PROTECTION_ENABLED` | `true` | Must stay `true` | Enforces CSRF checks for authenticated mutations. |
| `CSRF_COOKIE_NAME` | `sb_csrf` | Must match frontend | Name of CSRF cookie. |
| `CSRF_HEADER_NAME` | `x-csrf-token` | Must match frontend | Header required on protected mutations. |
| `CSRF_COOKIE_MAX_AGE_SECONDS` | `SESSION_COOKIE_MAX_AGE_SECONDS` | Review explicitly | CSRF cookie lifetime. |

### CORS

| Variable | Default | Prod requirement | Purpose / risk |
|---|---|---|---|
| `CORS_ORIGIN` | empty (dev fallbacks apply) | Must be set in production | Allow-list of exact origins. |
| `CORS_FAIL_CLOSED` | `true` | Must stay `true` | Server refuses startup without explicit `CORS_ORIGIN` in prod. |
| `CORS_ALLOW_ALL_ORIGINS` | `false` | Must stay `false` | Emergency-only bypass; otherwise origin checks are disabled. |

### Login rate limiting

| Variable | Default | Prod requirement | Purpose / risk |
|---|---|---|---|
| `LOGIN_MAX_ATTEMPTS` | `8` | Review explicitly | Max failed attempts per scope in rate-limit window. |
| `LOGIN_WINDOW_SECONDS` | `900` | Review explicitly | Window for counting failed logins. |
| `LOGIN_LOCK_SECONDS` | `900` | Review explicitly | Lock duration once limit is hit. |
| `LOGIN_ATTEMPT_RETENTION_DAYS` | `SESSION_RETENTION_DAYS` | Review explicitly | Cleanup retention for rate-limit state rows. |

### Transport and request hardening

| Variable | Default | Prod requirement | Purpose / risk |
|---|---|---|---|
| `GRAPHQL_BODY_LIMIT_BYTES` | `1048576` | Review explicitly | Caps request body size; prevents oversized payload abuse. |
| `LOG_TO_FILES` | `false` | Usually `false` | Enables local `error.log`/`combined.log` file transports. Prefer stdout/stderr in containerized production. |

## 3. Frontend coupling (shortbox-react)

These variables must be aligned with backend settings:

| Variable | Default | Prod requirement | Purpose / risk |
|---|---|---|---|
| `VITE_API_CREDENTIALS` | `include` | Must be `include` | Browser must send auth cookies to backend. |
| `VITE_CSRF_ENABLED` | `true` | Must stay `true` | Enables CSRF header injection on non-login mutations. |
| `VITE_CSRF_COOKIE_NAME` | `sb_csrf` | Must equal backend `CSRF_COOKIE_NAME` | Reads CSRF cookie value from browser cookie jar. |
| `VITE_CSRF_HEADER_NAME` | `x-csrf-token` | Must equal backend `CSRF_HEADER_NAME` | Sends CSRF token header expected by backend. |
| `REACT_APP_API_URL` / `VITE_API_URL` | backend URL | Must be explicit | Endpoint must be same origin policy/cookie strategy compatible. |

## 4. Deployment checklist

Run this checklist before each production rollout:

1. Confirm `CORS_ORIGIN` contains only expected frontend origins.
2. Confirm `SESSION_COOKIE_SECURE=true`.
3. Confirm `SESSION_COOKIE_SAME_SITE` is intentionally chosen (`Lax` or `None`).
4. Confirm CSRF backend/frontend names match:
   - `CSRF_COOKIE_NAME == VITE_CSRF_COOKIE_NAME`
   - `CSRF_HEADER_NAME == VITE_CSRF_HEADER_NAME`
5. Confirm `CORS_ALLOW_ALL_ORIGINS=false`.
6. Confirm `CSRF_PROTECTION_ENABLED=true`.
7. Confirm login throttling values are non-default only if intentionally tuned.

## 5. Startup validation (enforced)

On backend startup, production now fails fast if one of these conditions is violated:

- `SESSION_SECRET` is missing/fallback or shorter than 32 chars.
- `CSRF_PROTECTION_ENABLED` is not `true`.
- `CORS_ALLOW_ALL_ORIGINS` is enabled.
- `CORS_FAIL_CLOSED=true` without explicit `CORS_ORIGIN`.
- Any `CORS_ORIGIN` entry is not a clean origin URL (`http(s)://host[:port]`).
- Session cookies are not secure in production.
