# Extending This Server

To add a new tool:

1. Create `src/tools/my-new-tool.ts`, exporting `registerMyNewTool(server)`
   that calls `server.registerTool(...)` directly (raw-shape zod for
   `inputSchema`, not a wrapped `z.object(...)`, to match the rest of this
   codebase).
2. Append its description text with `Demo/test fixture.` so a real user
   connecting to this server understands intentional failures/delays aren't
   a bug.
3. Import and add it to the array in `src/tools/index.ts`.
4. Rebuild (`npm run build`) and manually verify with a raw JSON-RPC smoke
   test over stdio before wiring it into MCPFlo or the e2e suite.

To add a new resource, follow the same one-file-per-item pattern under
`src/resources/`. If it needs a capability the SDK doesn't auto-declare
(check by trying it first — `tasks`, `logging`, and `resources.subscribe`
all needed this), add it explicitly to the `capabilities` object in
`src/index.ts`.
