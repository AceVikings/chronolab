# ChronoLab provider roadmap

ChronoLab integrates with external providers only when their test environment exposes a safe, explicit simulation surface. A provider adapter must never send live-mode mutations, persist secret keys, or imply that external effects can be rolled back.

## Shipped: Stripe Test Clocks

The Stripe adapter supports sandbox Test Clock creation, attachment, status, advancement, detachment, deletion, and ordered webhook buffering.

Its automated coverage verifies:

- `sk_live_` credentials and live-mode objects are refused;
- Test Clock create, retrieve, advance, polling, timeout, and delete contracts;
- provider advancement completes before controlled containers restart;
- webhook request bytes and Stripe signatures are forwarded unchanged;
- webhook payloads are buffered during an advance and released in order afterward;
- API errors use stable codes and never expose the configured secret.

An optional credentialed sandbox smoke test may be added later, but it will remain opt-in because it creates and deletes real objects in a Stripe test account.

## Shipped: Chargebee Time Machine

The Chargebee adapter uses the `delorean` Time Machine on explicit test sites. It:

1. requires a test-site name and API credential from the environment;
2. requires `--confirm` before `start`, because start-afresh clears test customer data;
3. starts afresh, attaches to, or advances the Time Machine;
4. polls `time_travel_status` with a bounded timeout;
5. completes provider travel before local controlled services restart;
6. refuses local reset while the external clock is attached.

Contract tests cover request encoding, credential and site validation, sanitized failures, bounded polling, and provider-before-container ordering. A credentialed test-site smoke test remains opt-in because start-afresh deletes test data.

## Shipped: Paddle sandbox simulations

Paddle does not expose an application clock equivalent to Stripe Test Clocks. ChronoLab uses Paddle's sandbox simulation API to create and run subscription creation, renewal, pause, resume, and cancellation scenarios. It polls each run to completion, includes the resulting events, and fails when a delivery fails or aborts.

The shared webhook listener preserves `paddle-signature`, request bytes, and ordering while local applications advance. Live credentials and live API endpoints are refused. The website and CLI label this as lifecycle simulation—not wall-clock synchronization.

## Research: lifecycle and usage-billing providers

ChronoLab will evaluate Recurly and Zuora sandbox subscription, invoicing, dunning, and webhook surfaces, plus Orb and Metronome test-mode usage-event and invoice workflows. These remain research until a deterministic contract can be proven. Without a native clock, any future adapter will be explicitly scoped to event or lifecycle simulation.

## Shared adapter contract

Every provider integration must meet the same release gate:

- test or sandbox credentials only, with recognizable live credentials rejected;
- secrets read from environment variables and never persisted or printed;
- clock advancement completes before local application restart; standalone lifecycle simulations report only after provider completion;
- stable JSON status and error codes;
- bounded polling with clear timeouts;
- exact webhook payload preservation and ordered release;
- documented capability boundaries and cleanup behavior;
- deterministic automated contract tests before the integration is marked shipped.

Provider references: [Chargebee Time Machine](https://apidocs.chargebee.com/docs/api/time_machines), [Paddle simulations](https://developer.paddle.com/api-reference/simulations/create-simulation), [Recurly sandbox](https://docs.recurly.com/recurly-subscriptions/docs/sandbox-features-to-discover), [Orb test mode](https://docs.withorb.com/product-catalog/test-mode), and [Metronome sandbox](https://docs.metronome.com/developer-resources/sandbox/).
