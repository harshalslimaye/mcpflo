# Features

This server exercises a broad slice of the MCP protocol, deliberately kept
deterministic — no real chaos, no live browser automation, one exception
(the gzip tool's default network fetch, kept for compatibility with the
upstream reference server it was ported from).

- **Tools**: primitives, structured content, resource links, binary content,
  progress notifications, cancellation-safe long-running work.
- **Resources**: static file resources, session-scoped dynamic resources,
  subscribe/unsubscribe with simulated update notifications.
- **Elicitation**: form-mode and URL-mode, both request-path
  (`elicitation/create`) and error-path (`UrlElicitationRequiredError`).
- **Sampling**: server-initiated `sampling/createMessage`, synchronous and
  task-based (bidirectional MCP Tasks).
- **Tasks (SEP-1686)**: long-running tool execution via `tasks/get` and
  `tasks/result`, including a mid-flight elicitation pause
  (`input_required`).
- **Logging**: `logging/setLevel` with real RFC 5424 severity filtering.

Every tool's description ends with a "Demo/test fixture" note so a user
connecting to this server doesn't mistake intentional failures or delays for
a bug in MCPFlo itself.
