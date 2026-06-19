# MCPFlo

**A visual testing tool for MCP (Model Context Protocol) servers.**

MCPFlo is a desktop app that lets you connect to any MCP server, browse its tools,
resources, and prompts, and actually exercise them — call a tool with real inputs,
read a resource, render a prompt, and inspect the raw response — all without writing
a line of glue code or spending a single LLM token.

Think Postman, but for MCP.

![MCPFlo screenshot](docs/screenshot-dark.png)

> ⚠️ **Early development.** MCPFlo is young and moving fast. Connecting to servers,
> browsing capabilities, and calling tools/resources/prompts all work today. Expect
> rapid change.

---

## Why

MCP servers are hard to exercise today. Your options are usually:

- Drive everything through an AI client like Claude Desktop, which gives you little
  visibility into what each tool actually received and returned
- Write throwaway scripts against the SDK just to call a single tool
- Read the schema and guess

MCPFlo fills that gap — a local, deterministic, visual workbench for MCP where you
can see exactly what went into each tool, resource, and prompt and what came back.

---

## Features

- **Connect over stdio** — spawn a local MCP server as a child process from a
  command and args (e.g. `npx -y @modelcontextprotocol/server-memory`).
- **Connect over Streamable HTTP** — point MCPFlo at a remote MCP endpoint.
- **Browse capabilities** — every tool, resource, and prompt the server exposes,
  organized in a navigable tree. Discovery happens automatically on connect, and
  results are cached per server so reopening is instant.
- **Call tools** — MCPFlo generates an input form straight from each tool's JSON
  Schema (via [react-jsonschema-form](https://rjsf-team.github.io/react-jsonschema-form/)),
  validates your input, invokes the tool, and renders the raw content blocks it
  returns — text, JSON, images, and more.
- **Read resources** — fetch a resource by URI and inspect its contents.
- **Render prompts** — supply prompt arguments and see the fully expanded messages
  the server produces.
- **Handle server-initiated requests** — MCPFlo answers
  [elicitation](https://modelcontextprotocol.io/docs/concepts/elicitation) requests
  (a server asking the user for input mid-call) and
  [sampling](https://modelcontextprotocol.io/docs/concepts/sampling) requests with
  interactive modals, so you can test tools that call back into the client.
- **Live notifications** — progress and logging notifications emitted during a tool
  call surface in the UI as they arrive.
- **History** — past calls are recorded so you can revisit inputs and results.
- **Result dock** — a collapsible, maximizable panel for inspecting responses
  without losing your place in the tree.
- **Light & dark themes.**

---

## Getting started

### Prerequisites

- Node.js 18+
- npm 9+

### Install

```bash
git clone https://github.com/harshalslimaye/mcpflo.git
cd mcpflo
npm install
```

### Run in development

```bash
npm run dev
```

### Add your first server

1. Click **+ Add Server** in the sidebar.
2. Enter a name and choose a transport:
   - **stdio** — provide the command and args (e.g. `npx` with args
     `-y @modelcontextprotocol/server-everything`).
   - **Streamable HTTP** — provide the server URL.
3. Click **Add Server**.
4. Expand the server row — MCPFlo connects and discovers all tools, resources, and
   prompts automatically.
5. Select any capability to open its detail view, fill in the generated form, and
   run it.

Want something to test against right away? The MCP reference
[**Everything server**](https://github.com/modelcontextprotocol/servers/tree/main/src/everything)
exercises every capability MCPFlo supports — tools, resources, prompts, sampling,
and elicitation:

```
command: npx
args:    -y @modelcontextprotocol/server-everything
```

Server configs are persisted to your OS application-data directory:

| OS      | Path                                                |
| ------- | --------------------------------------------------- |
| macOS   | `~/Library/Application Support/MCPFlo/config.json`  |
| Windows | `%APPDATA%/MCPFlo/config.json`                       |
| Linux   | `~/.config/MCPFlo/config.json`                       |

Cached capabilities live alongside it under `MCPFlo/servers/<serverId>/`.

---

## Development

```bash
npm run dev         # run the app in development
npm test            # run the test suite once
npm run test:watch  # run tests in watch mode
npm run typecheck   # type-check main and renderer
npm run lint        # lint with ESLint
npm run format      # format with Prettier
```

The project ships with a Vitest + Testing Library suite covering the main-process
MCP client, persistence, schema helpers, and renderer components.

### Project structure

```
src/
├── main/        Electron main process — IPC, MCP client, capability cache, persistence
├── preload/     Typed contextBridge between main and renderer
├── renderer/    React UI — sidebar tree, tool/resource/prompt views, modals, stores
└── shared/      Types shared across processes (MCP schemas, server configs)
```

The renderer talks to MCP servers only through IPC channels (`mcp:*`) exposed by
the preload bridge; all SDK interaction happens in the main process.

---

## Build

```bash
npm run build:mac     # macOS
npm run build:win     # Windows
npm run build:linux   # Linux
```

Distributable artifacts are produced with [electron-builder](https://www.electron.build/).

---

## Tech stack

- [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/)
- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) — the MCP client
- [react-jsonschema-form (RJSF)](https://rjsf-team.github.io/react-jsonschema-form/) — schema-driven tool input forms
- [Zod](https://zod.dev/) — runtime validation
- [Zustand](https://zustand-demo.pmnd.rs/) — renderer state
- [electron-store](https://github.com/sindresorhus/electron-store) — config persistence
- [Vitest](https://vitest.dev/) + [Testing Library](https://testing-library.com/) — tests

---

## Contributing

MCPFlo is in early development and contributions are welcome. Open an issue to
discuss a change, or file a bug at the
[issue tracker](https://github.com/harshalslimaye/mcpflo/issues).

---

## License

MIT — free to use, modify, and distribute. See [LICENSE](LICENSE).
</content>
</invoke>
