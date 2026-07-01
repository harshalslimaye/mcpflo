# Instructions

Connect to this server the same way as any stdio MCP server: spawn
`node dist/index.js` (or the published `mcpflo-server-everything` bin) and
speak MCP over its stdin/stdout.

Nothing here requires configuration to get started — every tool has sane
defaults for its arguments. A few tools depend on the connecting client's
declared capabilities and will return a clear `isError` message instead of
failing silently if the client doesn't support what they need:

- `trigger-elicitation-request` / `-async` need `capabilities.elicitation`.
- `trigger-url-elicitation` needs `capabilities.elicitation.url`.
- `trigger-sampling-request` / `-async` need `capabilities.sampling`.

Everything else works with a bare-minimum client.
