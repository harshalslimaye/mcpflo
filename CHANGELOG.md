# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [0.1.0](https://github.com/harshalslimaye/mcpflo/compare/v0.0.6...v0.1.0) (2026-07-03)


### Features

* add "All" history tab with unified cross-server activity log ([29c1a97](https://github.com/harshalslimaye/mcpflo/commit/29c1a973a4e6919a72cfd7fc7f01cbb181602a61))
* add @mcpflo/server-everything test-fixture MCP server ([0d89c22](https://github.com/harshalslimaye/mcpflo/commit/0d89c225f5b7862e8b7c70c70adcad8395f47c8b))
* add a Tokens tab — response footprint and definition footprint ([e506ecf](https://github.com/harshalslimaye/mcpflo/commit/e506ecfeca50bbac0d2b5e187ad15ba715043734))
* add an OAuth auth details panel to the server detail view ([0ca6754](https://github.com/harshalslimaye/mcpflo/commit/0ca67542af5024a846c83a4b78fd3466e94ab825))
* add context-budget card to the server details view ([e8c44f0](https://github.com/harshalslimaye/mcpflo/commit/e8c44f09dc6780e47bf5d13fe08a49a7d0e5d930))
* add context-budget token-estimation utility ([208b7d0](https://github.com/harshalslimaye/mcpflo/commit/208b7d0f49508e2cfaaac0af55326e121071d693))
* add disconnect action to server rows ([b773408](https://github.com/harshalslimaye/mcpflo/commit/b77340840698179e9731ef4798f67b25e8328a9a))
* add expand/collapse all control to sidebar header ([e7e17cb](https://github.com/harshalslimaye/mcpflo/commit/e7e17cb17e3bb19042c774f9a728832640432d47))
* add pretty JSON tree view for result panels ([78bed3a](https://github.com/harshalslimaye/mcpflo/commit/78bed3a1815ebfe8c5f13532278978360a4df67e))
* add protocol version override for MCP connections ([85fa484](https://github.com/harshalslimaye/mcpflo/commit/85fa484438e9cbe143387940392de8960c2259b1))
* add Tools/Resources/Prompts sections to the server details view ([2fac48e](https://github.com/harshalslimaye/mcpflo/commit/2fac48e308e10e01d388f020b624d14237156ad1))
* cancel an in-flight capability fetch ([55077bd](https://github.com/harshalslimaye/mcpflo/commit/55077bdc0aea4d7b464b7dcc66295d4912ff4b0d))
* encrypt server credentials at rest with safeStorage ([33a2cfb](https://github.com/harshalslimaye/mcpflo/commit/33a2cfb567b20749aa8ad5b8ad4d65eceeb62948))
* keep transport secrets in main, operate on servers by id ([29946fa](https://github.com/harshalslimaye/mcpflo/commit/29946fac47d8d3285aefea103113ab7ffc170314))
* prefill the form when activating a tool/prompt from the "All" tab ([2e09e03](https://github.com/harshalslimaye/mcpflo/commit/2e09e03bbd191808aade4357f8532507d37d20f0))
* replace KEY=VALUE textareas with key/value row editor ([270d521](https://github.com/harshalslimaye/mcpflo/commit/270d521c486bbbfb56e78733c361c97c408743f5))
* select a server to open its (placeholder) details view ([7cdbef2](https://github.com/harshalslimaye/mcpflo/commit/7cdbef214061c3e867834be415dca21cf0401955))
* server details header and action bar ([25372d4](https://github.com/harshalslimaye/mcpflo/commit/25372d460d42072d1d143529716639ecefce03a1))
* tooltip and hover affordance on context-budget bar segments ([8668acb](https://github.com/harshalslimaye/mcpflo/commit/8668acb482ffc20ecd8ea0bcdc731120459676a7))
* track token issue time so hydration reports honest auth status ([8d00fc5](https://github.com/harshalslimaye/mcpflo/commit/8d00fc5b716e7666d1eaf7400e5b838835bd852d))


### Bug Fixes

* allowlist scheme before shell.openExternal ([7a578a4](https://github.com/harshalslimaye/mcpflo/commit/7a578a4d932dc7561517722c8d40f26754c52b25))
* block OAuth over cleartext http to non-loopback hosts ([c29ab37](https://github.com/harshalslimaye/mcpflo/commit/c29ab3774ff4417a890c65577b9742f147b9af83))
* block top-level navigation to non-app origins in main window ([690ae03](https://github.com/harshalslimaye/mcpflo/commit/690ae03b57caf535adf3c42f979a0a0ded0c85f7))
* bundle preload deps so sandboxed preload can load them ([7b0229a](https://github.com/harshalslimaye/mcpflo/commit/7b0229ab3e02a2ca2ed5d601e36ac18e3a295c46))
* clear cached capabilities when disconnecting a server ([f18b579](https://github.com/harshalslimaye/mcpflo/commit/f18b5795e0b694ea15ad9e5d28f48539eaeb8896))
* close spawned MCP server processes on app quit ([c948799](https://github.com/harshalslimaye/mcpflo/commit/c948799e55597358e096a5c52b73ae30017024e2))
* correct token footprint tokenizer label to o200k_base ([a48196a](https://github.com/harshalslimaye/mcpflo/commit/a48196a84e7c2d5f031191354e5e50092b3c8e80))
* disconnect a server's live process when it's removed ([685c916](https://github.com/harshalslimaye/mcpflo/commit/685c9165d475111370b7f6816014a7cb9c4e2575))
* e2e specs broken by the server-row chevron/select split ([45a3627](https://github.com/harshalslimaye/mcpflo/commit/45a3627d459549fc3e4145df0f3b1e11604ea4c4))
* enable Chromium renderer sandbox ([e7b4f2f](https://github.com/harshalslimaye/mcpflo/commit/e7b4f2f8d3ee05a36efd78f4132d61db94325429))
* exempt MCP-UI resources from the response size cap ([490587e](https://github.com/harshalslimaye/mcpflo/commit/490587ea8d9679becaf0fcc60ccdb3d182d0980d))
* initialize captured to satisfy TS definite-assignment check ([4110e03](https://github.com/harshalslimaye/mcpflo/commit/4110e037702afc001de57524b268415985ec24b5))
* prepare server-everything package for npm publish ([9253b15](https://github.com/harshalslimaye/mcpflo/commit/9253b15fe159bb6036b5c6da8852e92a4b29377f))
* report finishAuth failures instead of leaving the row stuck pending ([40b463b](https://github.com/harshalslimaye/mcpflo/commit/40b463b539370a89998430c9173a3f3db20a9288))
* sign out disconnects the server and restore auth status on launch ([9198b27](https://github.com/harshalslimaye/mcpflo/commit/9198b27127a60c9ac1f2b9da59163f1f5fdbb1b3))
* stop misdiagnosing ordinary connect failures as DCR failures ([8026ea1](https://github.com/harshalslimaye/mcpflo/commit/8026ea1ad0334f0ac18152da0d6b553c92a163f0))
* stop selecting a server from forcing a connect attempt ([24fc755](https://github.com/harshalslimaye/mcpflo/commit/24fc755351a3954fdc0015f03b4c997c50748c33))
* suppress stale re-auth browser tab on mid-session token expiry ([52ef73e](https://github.com/harshalslimaye/mcpflo/commit/52ef73ef4d5e0a6e0a75c78e8e47d59621934bbc))
* tooltip colors track the app's actual theme, not OS preference ([ca33b60](https://github.com/harshalslimaye/mcpflo/commit/ca33b60476396671ece1f8fe5bd7ba29e37cf626))
* validate OAuth callback state before honoring error/settling the flow ([f5cebc2](https://github.com/harshalslimaye/mcpflo/commit/f5cebc263c806f47d2a287808be69167b8729d84))
* validate server id in IPC handlers before it reaches fs paths ([9f8a4ae](https://github.com/harshalslimaye/mcpflo/commit/9f8a4aebe59507e77155fdbd8f52252aade9496c))
