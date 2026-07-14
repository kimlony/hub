# Security and Tenant Isolation

## Token trust boundaries

Easy Hub uses two independent JWT trust domains. They must never share a signing key.

| Token | Purpose | Required claims | Signing secret |
| --- | --- | --- | --- |
| UI JWT | Browser login and Hub/Admin APIs | `type=UI`, `sub`, `userId`, `corpId`, `role`, `iss`, `aud`, `exp` | `HUB_UI_JWT_SECRET` |
| External JWT | Partner `/api/external/**` APIs | `type=EXTERNAL`, `sub`, `clientId`, `userId`, `scopes`, `iss`, `aud`, `exp` | `HUB_EXTERNAL_JWT_SECRET` |

Each provider validates its own signature, token type, issuer, audience, expiry, and required claims. A token issued for one domain is rejected by the other even if its payload looks similar. Secrets must be different, at least 32 bytes, and supplied through the environment. Missing or weak secrets stop application startup.

## Principal and tenant source

After UI JWT validation, controllers receive `HubUserPrincipal(userId, corpId, username, role)`. The authenticated principal is the only source of tenant identity for Hub APIs.

- Clients do not send `corpId` query parameters for Job pipeline or ERP result APIs.
- Job list, detail, logs, dashboard, performance, pipeline, and retry operations scope SQL by the principal's `corpId`.
- ERP result list and detail operations use the principal's `corpId`.
- Cross-tenant detail and retry requests return the same `404` used for missing resources, so resource existence is not disclosed.
- Regular tenant dashboards never expose global load-test history. Global operational endpoints are restricted to `SYSTEM_ADMIN`.

## Route policy

Only these API endpoints are public:

- `POST /api/auth/login`
- `POST /api/external/auth/token`

External order endpoints require a valid External JWT and the required scope. Hub and export endpoints require a valid UI JWT. `/api/admin/**` additionally requires `SYSTEM_ADMIN`. Unmatched `/api/**` routes are denied by default.

The former `X-Hub-Api-Key` interceptor has been removed because no internal caller depended on it. Internal authentication should use an explicitly designed service identity instead of reusing UI or external tokens.

## Threat model

The controls above address token confusion, unsigned tenant selection, horizontal access across companies, accidental global dashboard leakage, and permissive fallback routes. They do not replace TLS, secret rotation, network restrictions, audit monitoring, or database least-privilege controls.
