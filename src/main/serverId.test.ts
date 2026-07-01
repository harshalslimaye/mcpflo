import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { assertValidServerId } from './serverId'

describe('assertValidServerId', () => {
  it('accepts a real randomUUID', () => {
    expect(() => assertValidServerId(randomUUID())).not.toThrow()
  })

  it('accepts uppercase hex', () => {
    expect(() => assertValidServerId(randomUUID().toUpperCase())).not.toThrow()
  })

  it.each([
    'not-a-uuid',
    '',
    '../../../etc/passwd',
    '../../Library/Application Support/other-app',
    '..%2f..%2fescape',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/../../escape',
    '   ',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaaaa' // too long
  ])('rejects %s', (id) => {
    expect(() => assertValidServerId(id)).toThrow()
  })
})
