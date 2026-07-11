# Operations Command Centre

React frontend for the IT Operations Command Centre.

## Mock data boundary

All temporary local data lives in:

```text
src/mocks/
```

Application screens do not import this folder directly. They call:

```text
src/services/operationsApi.ts
```

When the mock REST APIs are ready, replace the implementation inside
`operationsApi.ts` with real `fetch` calls and delete `src/mocks/`.

Keep the shared frontend data contracts in:

```text
src/domain/operations.ts
```

Those types are the agreement between the UI and whichever backend adapter is
active.
