# ChronoLab demo

This subscription-style lab proves that two unchanged Node.js processes share one controlled wall clock while Redis stays passive and a named data volume survives jumps.

## Run

Install the CLI first:

```bash
cd ../package
npm install
npm link
cd ../demo
```

Build the controlled API and worker, then start the lab on 1 January 2026:

```bash
chrono compose build -f compose.yaml
chrono compose up -f compose.yaml --at 2026-01-01T00:00:00Z
curl http://localhost:3000/time
chrono advance 30d
curl http://localhost:3000/time
```

Inspect the persisted startup history and passive Redis clock:

```bash
docker compose exec api cat /data/starts.jsonl
docker compose exec redis date -u
chrono events
```

The API and worker should report 31 January 2026 after the jump. Redis and the host remain on real time. `/data/starts.jsonl` contains entries from both application starts, proving the named volume survived the restart.

Clean up exact demo resources without deleting the named volume:

```bash
chrono destroy
docker volume rm demo_app-data
```

## Accelerated mode

To exercise timers in the already-running application processes:

```bash
chrono compose up -f compose.yaml --at 2026-01-01T00:00:00Z --speed 3600x
docker compose logs -f worker
```
