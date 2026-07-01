# How It Works

A single Node process talks MCP over stdio — no HTTP, no browser, no
external services except where a tool's whole purpose is to demonstrate one
(the gzip tool's optional network fetch).

Request lifecycle for a typical tool call:

1. Client sends `tools/call`.
2. The registered handler runs, using only what the SDK gives it
   (`args`, `extra.sendRequest`, `extra.sessionId`, etc.) — no shared mutable
   state between unrelated tools.
3. Tools that need server-initiated round trips (elicitation, sampling) call
   `extra.sendRequest(...)` and await the client's reply on the same
   connection.
4. Tools that register a resource at call time (e.g. gzip output) do so
   through `server.registerResource(...)`, which triggers
   `notifications/resources/list_changed` automatically.

Several capabilities are intentionally *not* auto-declared by the SDK and
have to be turned on explicitly at server construction: `tasks`, `logging`,
and `resources.subscribe`. See `architecture.md` for where that happens.
