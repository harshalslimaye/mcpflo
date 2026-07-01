# Startup

On launch, before the transport connects:

1. The `McpServer` is constructed with an in-memory task store and explicit
   `tasks`/`logging`/`resources.subscribe` capabilities (none of these are
   inferred automatically by the SDK from registering a tool or resource).
2. All tools register themselves via `registerTools(server)`.
3. A throwaway resource is registered and immediately disabled
   (`initSessionResources`) — purely to work around an SDK quirk where the
   very first `registerResource()` call tries to finalize the resources
   capability, which throws if it happens after `connect()`. Warming it up
   here means later, real dynamic resource registrations (e.g. from the
   gzip tool) work without special-casing.
4. Logging (`registerLoggingCapability`) and subscription
   (`registerSubscriptionsCapability`) request handlers are wired up.
5. The server connects over stdio and starts serving requests.

There is no seeding of demo data beyond this file-resource set — everything
else appears only when a tool creates it.
