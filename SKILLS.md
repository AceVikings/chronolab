# ChronoLab agent skill

ChronoLab includes an installable agent skill for coding agents that need to run date-sensitive Docker scenarios safely and consistently.

## Install

Install directly from this repository with the Skills CLI:

```bash
npx skills add AceVikings/chronolab --skill chronolab
```

Or copy [`skills/chronolab`](./skills/chronolab) into the skills directory used by your agent. The folder follows the portable `SKILL.md` format and includes Codex interface metadata.

## Invoke

```text
Use $chronolab to start this project on 2026-01-01 and verify its monthly renewal after advancing 30 days.
```

The skill teaches agents to:

- wrap and diagnose glibc Linux images without editing application source;
- keep databases and infrastructure passive by default;
- use deterministic jumps or accelerated time appropriately;
- coordinate Stripe sandbox Test Clocks and Chargebee test-site Time Machines without exposing credentials;
- run Paddle sandbox lifecycle simulations and preserve provider webhook signatures;
- prefer stable JSON output and structured diagnostics;
- avoid host clock changes, `CAP_SYS_TIME`, broad cleanup, and false rollback claims.

See the skill source at [`skills/chronolab/SKILL.md`](./skills/chronolab/SKILL.md).
