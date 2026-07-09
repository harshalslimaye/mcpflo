import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'node:path'
import type { LoadedServer } from '../../shared/mcp.types'

const USER_DATA = '/fake/userdata'

vi.mock('electron', () => ({
  app: { getPath: () => USER_DATA }
}))

const mockGetServerById = vi.fn<(id: string) => LoadedServer>()
vi.mock('../store', () => ({
  getServerById: (id: string) => mockGetServerById(id)
}))

import { resolveTestsRoot } from './testsRoot'

function server(over: Partial<LoadedServer> = {}): LoadedServer {
  return {
    id: 'srv',
    name: 'Srv',
    transport: { type: 'stdio', command: 'npx' },
    ...over
  }
}

beforeEach(() => {
  mockGetServerById.mockReset()
})

describe('resolveTestsRoot', () => {
  it('returns the default userData path when the server has no testsPath', () => {
    mockGetServerById.mockReturnValue(server())
    expect(resolveTestsRoot('srv')).toBe(join(USER_DATA, 'tests', 'srv'))
  })

  it('returns the custom testsPath as-is, with no serverId subfolder appended', () => {
    mockGetServerById.mockReturnValue(server({ testsPath: '/custom/folder' }))
    expect(resolveTestsRoot('srv')).toBe('/custom/folder')
  })

  it('looks the server up by the given id', () => {
    mockGetServerById.mockReturnValue(server())
    resolveTestsRoot('srv')
    expect(mockGetServerById).toHaveBeenCalledWith('srv')
  })
})
