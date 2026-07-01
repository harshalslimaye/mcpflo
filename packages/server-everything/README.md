# @mcpflo/server-everything

A deterministic, stdio-only MCP test-fixture server, built for stress-testing
[MCPFlo](../..) — a desktop testing tool for MCP servers. It exercises the
full protocol surface (tools, resources, prompts, elicitation, sampling,
tasks, logging, subscriptions) so MCPFlo's own UI has something real to
render against, beyond the official
[`@modelcontextprotocol/server-everything`](https://github.com/modelcontextprotocol/servers/tree/main/src/everything)
it was originally seeded with.

Every tool's description ends with "Demo/test fixture." so a user connecting
to this server doesn't mistake an intentional failure, delay, or capability
mismatch for a bug in MCPFlo itself.

## Quick start

```bash
npm run build
node dist/index.js
```

Or point any MCP client at it directly via stdio — no configuration required,
every tool has sane defaults for its arguments.

## What's here

**Tools** — 19, covering every tool in the upstream reference server
(including capability-gated ones like `get-roots-list` and
`trigger-url-elicitation`), plus fixes for several real bugs found while
porting them (see `docs/` for specifics). Capability-gated tools are
registered from the SDK's `oninitialized` hook, not eagerly — they only
appear in `tools/list` for clients that actually declare the capability they
need, matching upstream's own behavior exactly.

**Prompts** — 4: a no-argument prompt, one with required/optional arguments,
one with dependent argument completion, and one that embeds a resource.

**Resources** — 7 static documentation files (this package's own `docs/`,
describing its architecture, features, and how to extend it) plus 2 dynamic
resource templates (`mcpflo://dynamic/text/{resourceId}`,
`mcpflo://dynamic/blob/{resourceId}`) that regenerate content with a live
timestamp on every read and are deliberately excluded from `resources/list`.

Read [`docs/architecture.md`](docs/architecture.md) and
[`docs/extension.md`](docs/extension.md) for the actual code layout and how
to add a new tool or resource — those docs are themselves served by this
server, so they're worth reading through a connected client too.

## Testing

```bash
npm test
```

61 tests across 26 files, one test file per tool/prompt/resource module,
using the MCP SDK's `InMemoryTransport` to connect a real `Client` to a real
server instance in-process — no spawned child processes, no mocking of
protocol behavior. Most of the suite runs in milliseconds; a handful of tests
that verify actual timing/polling behavior (`simulate-research-query`, the
async trigger tools) deliberately use real timers and take a few seconds
each.

## Design notes

- **Deterministic by default.** No Playwright, no browser automation, no
  live network calls — with one intentional exception: `gzip-file-as-resource`
  defaults to fetching a real URL, kept for parity with the upstream
  reference server it was ported from.
- **Tools/resources are added one at a time, by hand.** There's no bulk
  generator, even for template-shaped families (see `docs/extension.md`).
- **Not yet wired as MCPFlo's seeded default server.** Currently a
  workspace-local devDependency, exercised by this package's own test suite.
  If it's ever seeded for real end users, it should launch a `sane`/`benign`
  preset, not the full adversarial catalog — that preset system doesn't
  exist yet.

## Publishing

This package declares `mcpName` for eventual MCP registry publication, in
addition to standard npm publishing. Neither has happened yet. When it does,
pin the exact version anywhere this package is spawned via `npx` (e.g. in
MCPFlo's own seeded server config) rather than leaving it unpinned — a new
publish should only reach users through a reviewed MCPFlo release, not
silently on next connect.
