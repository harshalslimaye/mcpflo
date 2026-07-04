import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createScriptStore, type ScriptStore } from './scriptStore'

let root: string
let store: ScriptStore

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'mcpflo-scriptstore-test-'))
  store = createScriptStore(root)
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('readScript / writeScript', () => {
  it('returns null when no script has been written', async () => {
    expect(await store.readScript('tool', 'get_weather')).toBeNull()
  })

  it('round-trips a written script', async () => {
    await store.writeScript('tool', 'get_weather', 'test("a", function () {})')
    expect(await store.readScript('tool', 'get_weather')).toBe('test("a", function () {})')
  })

  it('creates the kind subdirectory on first write', async () => {
    await store.writeScript('prompt', 'greeting', 'test("a", function () {})')
    expect(await store.readScript('prompt', 'greeting')).toBe('test("a", function () {})')
  })

  it('an empty script deletes the file rather than writing a blank one', async () => {
    await store.writeScript('tool', 'get_weather', 'test("a", function () {})')
    await store.writeScript('tool', 'get_weather', '')
    expect(await store.readScript('tool', 'get_weather')).toBeNull()
  })

  it('a whitespace-only script also deletes the file', async () => {
    await store.writeScript('tool', 'get_weather', 'test("a", function () {})')
    await store.writeScript('tool', 'get_weather', '   \n  ')
    expect(await store.readScript('tool', 'get_weather')).toBeNull()
  })

  it('deleting a script that was never written is a no-op, not an error', async () => {
    await expect(store.writeScript('tool', 'never_written', '')).resolves.toBeUndefined()
  })

  it('keeps different kinds of the same name independent', async () => {
    await store.writeScript('tool', 'shared_name', 'tool script')
    await store.writeScript('prompt', 'shared_name', 'prompt script')
    expect(await store.readScript('tool', 'shared_name')).toBe('tool script')
    expect(await store.readScript('prompt', 'shared_name')).toBe('prompt script')
  })

  it('round-trips a name with characters that need encoding (slashes, spaces)', async () => {
    const name = 'weird/name with spaces'
    await store.writeScript('resource', name, 'test("a", function () {})')
    expect(await store.readScript('resource', name)).toBe('test("a", function () {})')
  })
})

describe('readInputs / writeInputs', () => {
  it('returns null when no inputs have been written', async () => {
    expect(await store.readInputs('tool', 'get_weather')).toBeNull()
  })

  it('round-trips a written inputs object', async () => {
    await store.writeInputs('tool', 'get_weather', { city: 'Lisbon' })
    expect(await store.readInputs('tool', 'get_weather')).toEqual({ city: 'Lisbon' })
  })

  it('treats a corrupt inputs file as absent rather than throwing', async () => {
    await store.writeInputs('tool', 'get_weather', { city: 'Lisbon' })
    const path = join(root, 'tool', `${encodeURIComponent('get_weather')}.inputs.json`)
    await writeFile(path, '{ not json', 'utf-8')
    expect(await store.readInputs('tool', 'get_weather')).toBeNull()
  })

  it('writes the inputs file with 0o600 permissions', async () => {
    await store.writeInputs('tool', 'get_weather', { city: 'Lisbon' })
    const path = join(root, 'tool', `${encodeURIComponent('get_weather')}.inputs.json`)
    const mode = statSync(path).mode & 0o777
    expect(mode).toBe(0o600)
  })
})

describe('listScripts', () => {
  it('returns an empty list when nothing has been written', async () => {
    expect(await store.listScripts()).toEqual([])
  })

  it('lists every written script across all three kinds, decoding names', async () => {
    await store.writeScript('tool', 'get_weather', 'a')
    await store.writeScript('prompt', 'greeting', 'b')
    await store.writeScript('resource', 'weird/name', 'c')

    const results = await store.listScripts()
    expect(results).toHaveLength(3)
    expect(results).toEqual(
      expect.arrayContaining([
        { kind: 'tool', name: 'get_weather' },
        { kind: 'prompt', name: 'greeting' },
        { kind: 'resource', name: 'weird/name' }
      ])
    )
  })

  it('does not list a script after it was deleted via an empty write', async () => {
    await store.writeScript('tool', 'get_weather', 'a')
    await store.writeScript('tool', 'get_weather', '')
    expect(await store.listScripts()).toEqual([])
  })

  it('does not treat an .inputs.json file as a script', async () => {
    await store.writeInputs('tool', 'get_weather', { city: 'Lisbon' })
    expect(await store.listScripts()).toEqual([])
  })
})

describe('path safety', () => {
  it('refuses to read outside the tests root even if a caller bypasses the TestKind type', async () => {
    const maliciousKind = '../../etc' as Parameters<ScriptStore['readScript']>[0]
    await expect(store.readScript(maliciousKind, 'passwd')).rejects.toThrow(
      /outside the tests root/
    )
  })
})
