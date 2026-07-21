## Summary

- What changed?
- Why is it needed?

## Validation

- [ ] `cd package && npm test`
- [ ] `cd frontend && npm run build`
- [ ] Real Docker behavior checked when wrapper or orchestration code changed

## Safety

- [ ] No credentials, `.chronolab/` state, provider payloads, or generated output committed
- [ ] No host-clock mutation, `CAP_SYS_TIME`, or broad Docker cleanup introduced
