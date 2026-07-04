import { describe, it, expect } from 'vitest'
import { assertValidTestKind } from './testKind'

describe('assertValidTestKind', () => {
  it('accepts each real TestKind value', () => {
    expect(() => assertValidTestKind('tool')).not.toThrow()
    expect(() => assertValidTestKind('prompt')).not.toThrow()
    expect(() => assertValidTestKind('resource')).not.toThrow()
  })

  it('rejects a value that is not one of the three real kinds', () => {
    expect(() => assertValidTestKind('bogus')).toThrow(/Invalid test kind/)
  })

  it('rejects a path-traversal attempt disguised as a kind', () => {
    expect(() => assertValidTestKind('../../etc')).toThrow(/Invalid test kind/)
  })

  it('rejects an empty string', () => {
    expect(() => assertValidTestKind('')).toThrow(/Invalid test kind/)
  })
})
