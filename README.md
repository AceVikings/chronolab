# ChronoLab

Deterministic wall-clock testing for Docker applications.

ChronoLab wraps an existing dynamically linked Linux image with `libfaketime`, then gives its processes a controllable realtime clock. Application code keeps calling normal APIs—`Date.now()`, `new Date()`, `time.time()`, `Time.now`, or libc time functions—without an SDK or source changes.

```bash
chrono build -f Dockerfile -t billing-api:chrono .
chrono run billing-api:chrono --at 2026-01-01T00:00:00Z
chrono advance 30d
chrono exec date -u
```

The host clock is never changed and ChronoLab never requests `CAP_SYS_TIME`. Monotonic time remains real by default so networking, event loops, locks, and timeouts keep normal behavior.

## Install

ChronoLab requires Node.js 20+, Docker, and network access for the first architecture-specific shim build. Install the versioned release artifact directly from GitHub:

```bash
npm install --global https://github.com/AceVikings/chronolab/releases/download/v0.2.0/chronolab-0.2.0.tgz
chrono --version
```

To work from source instead, clone the repository and run `npm install && npm link` inside `package/`.

## Repository

- [`package/`](./package) — dependency-free JavaScript CLI, Docker shim, provider adapters, MCP server, and tests
- [`frontend/`](./frontend) — Vite, React, TypeScript, and Tailwind landing page
- [`demo/`](./demo) — executable Compose example with two controlled Node.js services, passive Redis, and a persistent volume
- [`skills/chronolab/`](./skills/chronolab) — portable agent skill for safe, repeatable clock-control workflows

## Development

Requirements: Node.js 20.19 or newer and Docker.

```bash
cd package
npm install
npm test

cd ../frontend
npm install
npm run build
npm run dev
```

Each directory owns its dependencies and lockfile. The CLI suite lives in `package/`; the production landing page is emitted to `frontend/dist`.

## Capabilities

- Wrap existing glibc Linux Docker images without modifying their Dockerfiles
- Deterministic forward jumps with atomic state and restart verification
- Experimental accelerated clocks for running application processes
- Multiple controlled Docker Compose services with passive dependencies
- Stripe sandbox Test Clock creation, attachment, status, and coordinated advancement
- Buffered Stripe webhook forwarding during clock changes
- Stable JSON output, structured events, diagnostic export, and MCP tools
- Compatibility checks, per-run locking, exact resource targeting, and retained diagnostics

See the [CLI guide](./package/README.md) for commands and support boundaries.

See the [provider roadmap](./ROADMAP.md) for the tested Stripe contract and planned Chargebee, Paddle, and Recurly integrations.

Run the working [Docker Compose demo](./demo) to see two controlled Node.js services share logical time while Redis stays passive.

## Project policies

ChronoLab is available under the [MIT License](./LICENSE). Contributions are welcome; read [CONTRIBUTING.md](./CONTRIBUTING.md), [SECURITY.md](./SECURITY.md), and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) before participating.
