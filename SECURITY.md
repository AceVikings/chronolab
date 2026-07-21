# Security policy

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability reporting for this repository.

Include the affected command, environment, reproduction steps, and potential impact. Do not include live provider credentials or sensitive webhook payloads.

## Security boundaries

ChronoLab executes user-selected Docker builds and commands. Review Dockerfiles before running them. The CLI does not change the host clock, request `CAP_SYS_TIME`, persist Stripe keys, or perform broad Docker cleanup. Stripe support accepts test-mode secret keys only.
