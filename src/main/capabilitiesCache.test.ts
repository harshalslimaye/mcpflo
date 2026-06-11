import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  readCapabilities,
  writeCapabilities,
  clearCapabilities,
  removeServerDir,
  readAllCapabilities
} from './capabilitiesCache'
import type { ConnectResult } from '../shared/mcp.types'

// app.getPath is read on every call, so pointing it at a per-test temp dir is
// enough — no module reset needed.
const h = vi.hoisted(() => ({ userData: '' }))

vi.mock('electron', () => ({
  app: { getPath: () => h.userData }
}))

const caps: ConnectResult = {
  tools: [{ name: 'echo', inputSchema: { type: 'object' } }],
  resources: [],
  prompts: []
}

beforeEach(() => {
  h.userData = mkdtempSync(join(tmpdir(), 'mcpflo-cache-test-'))
})

afterEach(() => {
  rmSync(h.userData, { recursive: true, force: true })
})

describe('capabilitiesCache', () => {
  it('round-trips capabilities and stamps fetchedAt', async () => {
    await writeCapabilities('srv-1', caps)
    const read = await readCapabilities('srv-1')
    expect(read?.tools).toEqual(caps.tools)
    expect(read?.fetchedAt).toEqual(expect.any(Number))
  })

  it('leaves no temp file behind after a write', async () => {
    await writeCapabilities('srv-1', caps)
    const files = await fs.readdir(join(h.userData, 'servers', 'srv-1'))
    expect(files).toEqual(['capabilities.json'])
  })

  it('returns undefined for a server that was never cached', async () => {
    expect(await readCapabilities('nope')).toBeUndefined()
  })

  it('returns undefined for a corrupt capabilities file', async () => {
    const dir = join(h.userData, 'servers', 'srv-1')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, 'capabilities.json'), '{not json', 'utf-8')
    expect(await readCapabilities('srv-1')).toBeUndefined()
  })

  it('clearCapabilities removes the file but keeps the server folder', async () => {
    await writeCapabilities('srv-1', caps)
    await clearCapabilities('srv-1')
    expect(await readCapabilities('srv-1')).toBeUndefined()
    await expect(fs.stat(join(h.userData, 'servers', 'srv-1'))).resolves.toBeDefined()
  })

  it('clearCapabilities is a no-op when nothing is cached', async () => {
    await expect(clearCapabilities('nope')).resolves.toBeUndefined()
  })

  it('removeServerDir deletes the whole per-server folder', async () => {
    await writeCapabilities('srv-1', caps)
    await removeServerDir('srv-1')
    await expect(fs.stat(join(h.userData, 'servers', 'srv-1'))).rejects.toThrow()
  })

  it('readAllCapabilities maps every cached server by id', async () => {
    await writeCapabilities('srv-1', caps)
    await writeCapabilities('srv-2', { tools: [], resources: [], prompts: [] })
    const all = await readAllCapabilities()
    expect(Object.keys(all).sort()).toEqual(['srv-1', 'srv-2'])
    expect(all['srv-1'].tools).toEqual(caps.tools)
  })

  it('readAllCapabilities skips folders without a readable cache file', async () => {
    await writeCapabilities('srv-1', caps)
    await fs.mkdir(join(h.userData, 'servers', 'empty-srv'), { recursive: true })
    const all = await readAllCapabilities()
    expect(Object.keys(all)).toEqual(['srv-1'])
  })

  it('readAllCapabilities returns an empty map when the servers dir does not exist', async () => {
    expect(await readAllCapabilities()).toEqual({})
  })
})
