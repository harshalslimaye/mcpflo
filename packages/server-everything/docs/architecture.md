# Architecture

`@mcpflo/server-everything` is a single stdio MCP server (`src/index.ts`) built
from small, individually-registered pieces:

- `src/tools/` — one file per tool, each exporting a `register<Name>(server)`
  function that calls `server.registerTool(...)` directly. `src/tools/index.ts`
  is a barrel that aggregates them into `registerTools(server)`.
- `src/resources/` — resource-side infrastructure: static file resources
  (this doc set), session-scoped dynamic resources (e.g. gzip output),
  templated resources, and the subscribe/unsubscribe handlers.
- `src/server/` — server-wide capability plumbing that isn't resource- or
  tool-specific, e.g. the simulated logging level tracking.

Tools and resources are added one at a time by hand — there is no bulk
generator. `index.ts` wires everything together: constructs the `McpServer`,
declares capabilities that aren't auto-detected by the SDK (`tasks`,
`logging`, `resources.subscribe`), registers all tools/resources, then
connects over stdio.
