# ChronoLab CLI

ChronoLab is a dependency-free Node.js CLI for deterministic wall-clock testing in Docker. It injects `libfaketime` into a wrapper image, stores clock state under `.chronolab/`, and advances controlled processes without changing the host clock.

## Runtime contract

No application integration is required. Dynamically linked realtime calls—including Node.js `Date.now()` and `new Date()`, Python `time.time()`, Ruby `Time.now`, PHP `time()`, `/bin/date`, and libc `CLOCK_REALTIME`—observe the configured ChronoLab time from process startup.

ChronoLab intentionally leaves `CLOCK_MONOTONIC` real. Existing long waits are not interrupted by a clock-file update, so deterministic jumps restart controlled containers. The same container filesystem and attached volumes are preserved.

Unsupported boundaries:

- Linux glibc images only; musl/Alpine and typical static binaries cannot use the shim
- Database server expressions such as Postgres `NOW()` remain real when the database is passive
- External services require explicit provider adapters
- Backward travel is refused after external side effects; reset cannot roll back Stripe

## Install

Requirements: Node.js 20 or newer, Docker, and network access for the first shim build.

```bash
npm install --global https://github.com/AceVikings/chronolab/releases/download/v0.2.0/chronolab-0.2.0.tgz
chrono --version
```

From a source checkout, run `npm install && npm link` inside `package/`. The package metadata is also ready for a future `npm publish --provenance`; the GitHub release artifact is the supported install source for v0.2.0.

## Single image workflow

```bash
chrono build -f Dockerfile -t billing-api:chrono .
chrono doctor billing-api:chrono
chrono run billing-api:chrono --at 2026-01-01T00:00:00Z --volume ./data:/data
chrono now
chrono advance 30d
chrono exec date -u
chrono destroy
```

Use `--speed 3600x` with `run`, or `chrono warp 3600x`, for experimental accelerated time. Acceleration applies to the already-running application process; `chrono now` derives its current logical timestamp from the persisted wall-clock anchor and speed.

## Docker Compose

Create `.chronolab.yaml` beside the Compose file:

```yaml
version: 1
services:
  api:
    context: ./api
    dockerfile: ./api/Dockerfile
    control: wall-clock
  worker:
    context: ./worker
    dockerfile: ./worker/Dockerfile
    control: wall-clock
  postgres:
    control: passive
advance:
  strategy: restart
  order: [api, worker]
```

Then run:

```bash
chrono compose build -f compose.yaml
chrono compose up -f compose.yaml --at 2026-01-01T00:00:00Z
chrono advance 30d
chrono destroy
```

Generated wrappers, manifests, and Compose overrides remain under `.chronolab/generated/` for inspection. Passive services remain running during jumps.

## Stripe sandbox clocks

Only `sk_test_` credentials and sandbox Test Clocks are accepted. Secrets are read from the environment and never persisted or printed.

```bash
export STRIPE_SECRET_KEY=sk_test_...
chrono stripe create --at 2026-01-01T00:00:00Z
chrono stripe attach clock_123
chrono stripe status
chrono advance 30d
chrono stripe detach
chrono stripe delete --confirm
```

When a clock is attached, `advance` stops controlled applications, advances Stripe, waits for `ready`, updates the local clock, restarts and verifies applications, then releases buffered webhooks.

Run `chrono stripe listen --forward-to http://localhost:3000/webhooks/stripe --port 4243` to accept webhook payloads on `127.0.0.1`. Point Stripe or `stripe listen` at that local endpoint. Payload bytes and ordering are preserved; ChronoLab metadata is added only as a forwarding header.

## Agents and diagnostics

Every command supports `--json`. Errors use stable codes.

```bash
chrono events --json
chrono export --output chronolab-run.json
chrono mcp serve
```

The MCP stdio server exposes `chronolab_now`, `chronolab_advance`, `chronolab_set`, and `chronolab_events` using protocol version `2025-11-25`.

## Configuration

- `--root PATH` selects the project state root
- `--run RUN_ID` selects a non-active run where supported
- `CHRONOLAB_DOCKER` selects a Docker-compatible executable
- `CHRONOLAB_SHIM_IMAGE` uses a prebuilt shim
- `CHRONOLAB_SHIM_BUILD_IMAGE` overrides the Debian-compatible shim build image
- `--build-arg NAME=VALUE` forwards one argument to the original image build

By default, ChronoLab builds and caches `chronolab-shim:glibc-<architecture>` from [`shim/Dockerfile`](./shim/Dockerfile), including libfaketime license and source notices.

## Test

```bash
npm test
npm pack --dry-run
```

The suite covers duration parsing, atomic writes, locking, wrapper rendering, full CLI subprocess lifecycles, Compose controlled/passive behavior, Stripe coordination and safety, webhook ordering, accelerated clocks, export, and MCP stdio.
