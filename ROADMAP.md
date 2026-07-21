# ChronoLab provider roadmap

ChronoLab integrates with external providers only when their test environment exposes a safe, explicit simulation surface. A provider adapter must never send live-mode mutations, persist secret keys, or imply that external effects can be rolled back.

## Shipped: Stripe Test Clocks

The Stripe adapter is included in v0.2.0 and supports sandbox Test Clock creation, attachment, status, advancement, detachment, deletion, and ordered webhook buffering.

Its automated coverage verifies:

- `sk_live_` credentials and live-mode objects are refused;
- Test Clock create, retrieve, advance, polling, timeout, and delete contracts;
- provider advancement completes before controlled containers restart;
- webhook request bytes and Stripe signatures are forwarded unchanged;
- webhook payloads are buffered during an advance and released in order afterward;
- API errors use stable codes and never expose the configured secret.

An optional credentialed sandbox smoke test may be added later, but it will remain opt-in because it creates and deletes real objects in a Stripe test account.

## Next: Chargebee Time Machine

Chargebee exposes a Time Machine API on test sites. The planned adapter will:

1. require a test-site hostname and test API credential;
2. start afresh or advance the `delorean` Time Machine;
3. poll `time_travel_status` until `succeeded` or `failed`;
4. coordinate provider completion before local controlled services restart;
5. buffer and release Chargebee webhooks using the same byte-preserving contract as Stripe.

Acceptance requires local contract tests, live-mode refusal, sanitized errors, timeout handling, and an opt-in test-site smoke test.

## Planned: Paddle webhook simulations

Paddle does not expose an application clock equivalent to Stripe Test Clocks. Its Webhook Simulator can run subscription lifecycle scenarios, including renewals and failed-payment paths. The planned adapter will create and run sandbox simulations, correlate simulation-run events, and route them through ChronoLab's ordered webhook listener.

The website and CLI will label this as lifecycle simulation—not wall-clock synchronization.

## Research: Recurly sandbox workflows

ChronoLab will evaluate Recurly's sandbox subscription, invoicing, and dunning surfaces. This remains research until a deterministic provider-side advancement contract can be proven. If no native clock exists, any future adapter will be explicitly scoped to event or lifecycle simulation.

## Shared adapter contract

Every provider integration must meet the same release gate:

- test or sandbox credentials only, with recognizable live credentials rejected;
- secrets read from environment variables and never persisted or printed;
- provider advancement or simulation completes before local application restart;
- stable JSON status and error codes;
- bounded polling with clear timeouts;
- exact webhook payload preservation and ordered release;
- documented capability boundaries and cleanup behavior;
- deterministic automated contract tests before the integration is marked shipped.

Provider references: [Chargebee Time Machine](https://apidocs.chargebee.com/docs/api/time_machines), [Paddle Webhook Simulator](https://developer.paddle.com/webhooks/simulator/), and [Recurly sandbox](https://docs.recurly.com/recurly-subscriptions/docs/sandbox-features-to-discover).
