# flirt-api

Flirt backend — tone-based AI reply generation. NestJS + PostgreSQL + Redis
with a **swappable multi-provider AI layer** (OpenAI / Claude / Gemini / fake).

Specs live in `flirt-docs` (ARCHITECTURE.md, API_ENDPOINTS.md, AI_PROMPTS.md).

## Quick start (local dev)

Infrastructure (Postgres + Flyway + Redis + adminer + API) lives in
**`flirt-infra`**:

```bash
# Full dockerized stack (runs Flyway migrations, then the API)
../Flirt-infra/scripts/up.sh
```

For API development with hot reload, run only the infra containers and the
API locally:

```bash
cd ../Flirt-infra && docker compose up -d postgres flyway redis adminer && cd -
cp .env.example .env   # defaults work out of the box (AI_PROVIDER=fake)
npm install
npm run start:dev
```

Adminer (DB UI): http://localhost:8080 — server `postgres`, user `flirt`,
password `flirt_dev_password`.

## Database migrations (Flyway)

Versioned SQL in `migrations/` — `V1__init.sql`, `V2__short_name.sql`, …
Applied by the Flyway container in `flirt-infra` **before** the API starts.

```bash
../Flirt-infra/scripts/migrate.sh   # apply pending migrations
```

Rules: never edit an applied migration (checksums); schema changes always get a
new `V<n>` file and an update to `flirt-docs/DATABASE_SCHEMA.md`. Data access
is raw SQL via `DbService` (`pg` Pool) — no ORM.

## Smoke test

```bash
# Health
curl http://localhost:3000/health

# Get a device token
TOKEN=$(curl -s -X POST http://localhost:3000/auth/device \
  -H 'Content-Type: application/json' \
  -d '{"deviceIdentifier":"dev-device-001","platform":"ios"}' |
  node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')

# Generate replies
curl -s -X POST http://localhost:3000/ai/replies \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"message":"Hey, how was your weekend?","tone":"light_flirt","intent":"reply"}'
```

## AI providers

Set in `.env`:

| `AI_PROVIDER` | Needs | Default model |
|---|---|---|
| `fake` | nothing (dev/tests) | `fake-model-v1` |
| `openai` | `OPENAI_API_KEY` | `gpt-4o-mini` |
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-opus-4-8` |
| `gemini` | `GEMINI_API_KEY` | `gemini-2.0-flash` |

Override the model with `AI_MODEL`. Swapping providers is config-only.

## MVP policy

No plan limits are enforced (`ENFORCE_PLAN_LIMITS=false`) — usage is metered
(`usage_events` + Redis) but unrestricted. Only an anti-abuse ceiling
(`ABUSE_MAX_REQUESTS_PER_HOUR`) is active. See `flirt-docs/COST_MODEL.md`.

## Endpoints (v0.1)

| Method | Path | Auth |
|---|---|---|
| GET | `/health` | none |
| POST | `/auth/device` | none |
| POST | `/auth/refresh` | none |
| POST | `/ai/replies` | Bearer |
| POST | `/ai/refine` | Bearer |

## Contracts

Payload shapes are mirrored in [`flirt-contracts`](https://github.com/dennys9415/Flirt-contracts)
— the arbiter when API DTOs and iOS models disagree. Breaking-change rules:
`flirt-contracts/rules/versioning.rules.md` (never break an installed app).
