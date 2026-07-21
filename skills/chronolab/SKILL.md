---
name: chronolab
description: Control and inspect wall-clock time in dynamically linked glibc Linux Docker applications without changing project source. Use when an agent needs to test subscriptions, expiries, schedulers, cron workers, date-sensitive workflows, Docker Compose services, Stripe sandbox Test Clocks, Chargebee test-site Time Machines, or Paddle sandbox lifecycle simulations.
---

# Use ChronoLab

Operate the `chrono` CLI from the user's project root. Do not modify application source to inject a clock SDK.

## Preconditions

1. Confirm Node.js 20+ and Docker are available.
2. Read the target Dockerfile or `.chronolab.yaml` before executing it.
3. Treat glibc Linux application processes as controlled. Keep Postgres, Redis, mail sinks, and other infrastructure passive unless the project explicitly proves support.
4. Never add `CAP_SYS_TIME`, call `date --set`, or change the host clock.

## Single-image workflow

```bash
chrono build -f Dockerfile -t app:chrono .
chrono doctor app:chrono
chrono run app:chrono --at 2026-01-01T00:00:00Z
chrono now --json
chrono advance 30d --json
chrono exec -- date -u
```

Use `--volume SOURCE:TARGET` on `run` when persistence matters. Run `chrono destroy` after the scenario; ChronoLab retains diagnostic state but removes only the selected run's containers.

## Compose workflow

Require a `.chronolab.yaml` that marks every service `wall-clock` or `passive`.

```bash
chrono compose build -f compose.yaml
chrono compose up -f compose.yaml --at 2026-01-01T00:00:00Z
chrono advance 30d --json
```

Inspect `.chronolab/generated/` when debugging wrapped Dockerfiles or overrides.

## Time modes

- Prefer `chrono advance DURATION` for deterministic scheduling tests. It atomically updates the clock, restarts controlled services in order, and verifies realtime.
- Use `chrono warp 3600x` only for timer-driven scenarios that need a running process to experience accelerated time.
- Treat `CLOCK_MONOTONIC` as real. A jump does not wake a syscall already blocked on a long wait.
- Refuse backward travel. Do not imply rollback of external side effects.

## Stripe sandbox

Use only `STRIPE_SECRET_KEY=sk_test_...`. Never print, persist, or request a live key.

```bash
chrono stripe create --at 2026-01-01T00:00:00Z --json
chrono stripe attach clock_123 --json
chrono stripe status --json
chrono advance 30d --json
```

An attached clock advances before local containers restart. Reset is intentionally refused while Stripe is attached.

## Chargebee test sites

Use only an explicit `CHARGEBEE_TEST_SITE` and `CHARGEBEE_API_KEY`. Starting afresh clears customer data on that test site, so run it only with direct user authorization and the required `--confirm` flag.

```bash
chrono chargebee start --at 2026-01-01T00:00:00Z --confirm --json
chrono chargebee status --json
chrono advance 30d --json
```

An attached Time Machine advances before local containers restart. Reset is intentionally refused while Chargebee is attached.

## Paddle sandbox simulations

Use only `PADDLE_SANDBOX_API_KEY` values containing `_sdbx_`. Paddle simulations model lifecycle events; do not describe them as changing Paddle's clock.

```bash
chrono paddle simulate subscription_renewal --notification-setting ntfset_123 --json
chrono paddle status --json
```

When forwarding webhooks, use `chrono paddle listen --forward-to URL`; ChronoLab preserves body bytes, ordering, and `paddle-signature`.

## Agent output

Prefer `--json`. On failure, report the stable error code, expected and observed logical timestamps, active run ID, and the relevant path under `.chronolab/`. Use `chrono events --json` and `chrono export --output FILE` for diagnostics. Do not hide unsupported runtime or provider behavior.
