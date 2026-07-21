# Changelog

All notable changes to ChronoLab are documented here.

## 0.2.0 — 2026-07-21

Initial public release.

### CLI

- Wrap dynamically linked glibc Linux Docker images without modifying application source.
- Set, inspect, advance, reset, accelerate, diagnose, execute in, and destroy controlled runs.
- Preserve writable layers and mounted volumes across restart-based clock jumps.
- Build and run controlled Docker Compose services while keeping infrastructure passive.
- Create, attach, inspect, advance, detach, and delete Stripe sandbox Test Clocks.
- Buffer and forward Stripe webhook bytes in order during coordinated advancement.
- Emit stable JSON errors, structured events, diagnostic exports, and MCP tools.
- Build an architecture-matched local libfaketime shim with license notices.

### Repository

- Add a working API, worker, Redis, and persistent-volume demo.
- Add a Vite, React, TypeScript, and Tailwind landing page.
- Add an installable ChronoLab agent skill.
- Add public contribution, security, conduct, license, and CI documentation.
