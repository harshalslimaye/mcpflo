# Structure

```
packages/server-everything/
├── docs/                     this file set — copied into dist/ at build time
├── src/
│   ├── index.ts              server construction, capability wiring, connect
│   ├── tools/                one file per tool + a barrel (index.ts)
│   ├── resources/
│   │   ├── templates.ts      static text/blob resource-reference helpers
│   │   ├── session.ts        dynamic session-scoped resource registration
│   │   ├── subscriptions.ts  resources/subscribe + simulated update loop
│   │   └── file-resources.ts registers this docs/ set as static resources
│   └── server/
│       └── logging.ts        logging/setLevel + simulated log messages
├── package.json
└── tsconfig.json
```

New tools and resources are added one file at a time, then wired into the
relevant barrel — never generated in bulk.
