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

## About the project

### Why we built it

Time-dependent features are awkward to test. A subscription renewal may be thirty days away. A trial-expiry bug might only appear at midnight. Scheduled jobs, dunning flows, and month-end logic all depend on a clock that developers usually cannot move safely.

The usual options are not great: wait, change the host clock, or thread a mock-clock abstraction through application code. ChronoLab started with a more practical question: what if time could be ordinary test data?

The goal was to take an existing Docker application, start it on a chosen date, move it forward by days or months, and leave the application itself alone.

### How it works

ChronoLab wraps the final Linux image with an architecture-compatible `libfaketime` shim. The shim intercepts realtime calls below the application layer, so familiar APIs such as `Date.now()`, `new Date()`, `time.time()`, and `Time.now` see the configured clock without an SDK or source edit.

Clock state lives in an inspectable `.chronolab/` directory. During a time jump, ChronoLab locks the run, stops only controlled application containers, advances attached sandbox providers, writes the new clock generation, restarts services in order, and checks the timestamp observed by every process. Volumes and writable container layers survive the restart.

The CLI is dependency-free JavaScript. The documentation site uses React, TypeScript, Vite, and Tailwind CSS. A working Compose demo exercises two controlled Node.js services alongside passive Redis.

### What we learned

Changing a timestamp was the easy part. The real work was deciding which clocks should move and how to keep several systems consistent while they do.

Wall-clock time and monotonic time cannot be treated as the same thing. ChronoLab controls realtime but leaves monotonic clocks alone, which keeps event loops, locks, networking, and timeouts behaving normally. A clock jump also cannot wake a process that is already blocked, so controlled containers restart after deterministic jumps.

External providers add another ordering problem. If local services restart before a billing provider finishes advancing, the test can observe two different dates. ChronoLab waits for the provider first and buffers incoming webhook bytes until the local applications are ready again.

### Challenges

Container compatibility needed clear boundaries. `LD_PRELOAD` works for dynamically linked glibc applications, but not typical static binaries or musl-based images. ChronoLab reports those cases instead of pretending they work.

Safe cleanup mattered too. The CLI uses exact run labels and per-run state rather than broad Docker commands. It never changes the host clock or requests `CAP_SYS_TIME`. Provider integrations accept sandbox credentials only, avoid persisting secrets, and return stable error codes that agents and CI jobs can handle.

Testing accelerated time uncovered a subtle distinction between asking a newly started utility for the time and observing the long-running application process. The final tests check the application itself, including real timer ticks, persisted volumes, provider ordering, and webhook delivery.

### How Codex and GPT-5.6 were used

Codex powered by GPT-5.6 was used throughout development as a hands-on engineering collaborator. It helped turn the initial product plan into the CLI architecture, implement the Docker and provider workflows, write tests, run the real Compose demo, diagnose clock behavior, and build the landing page.

The model also helped pressure-test decisions rather than simply generate code. It traced failures through container logs, caught the difference between wall-clock and monotonic behavior, expanded Stripe safety tests, reviewed public-package metadata, and checked the site in a real browser at desktop and mobile sizes. Human direction set the product scope and safety rules; every shipped path was then verified with executable tests or a live local demo.

### Repository

Source code, documentation, examples, and releases are available at [github.com/AceVikings/chronolab](https://github.com/AceVikings/chronolab).

## Project policies

ChronoLab is available under the [MIT License](./LICENSE). Contributions are welcome; read [CONTRIBUTING.md](./CONTRIBUTING.md), [SECURITY.md](./SECURITY.md), and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) before participating.
