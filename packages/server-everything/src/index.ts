#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './createServer'

const server = createServer()

server.connect(new StdioServerTransport()).catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
