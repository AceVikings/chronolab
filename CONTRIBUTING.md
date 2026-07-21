# Contributing to ChronoLab

Thanks for helping improve deterministic time testing for Docker applications.

## Development

Requirements: Node.js 20.19 or newer and Docker Desktop or Docker Engine.

```bash
npm install
npm test
npm run build
```

Package tests use Node's built-in test runner and a Docker-compatible fixture. Real Docker changes should also be exercised against a dynamically linked glibc image.

## Pull requests

- Keep changes focused and explain user-visible behavior.
- Add or update tests for package changes.
- Run `npm run test:all` before submitting.
- Never commit `.chronolab/`, credentials, provider payloads, or generated build output.
- Preserve the rule that ChronoLab never requests `CAP_SYS_TIME` or modifies the host clock.

By contributing, you agree that your contributions are licensed under the MIT License.
