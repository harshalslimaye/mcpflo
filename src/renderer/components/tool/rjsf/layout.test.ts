import { describe, it, expect } from 'vitest'
import type { RJSFSchema } from '@rjsf/utils'
import { planLayout, buildUiSchema, isMultilineString } from './layout'

function obj(properties: Record<string, RJSFSchema>, required: string[] = []): RJSFSchema {
  return { type: 'object', properties, required }
}

const str: RJSFSchema = { type: 'string' }
const num: RJSFSchema = { type: 'number' }
const bool: RJSFSchema = { type: 'boolean' }
const en: RJSFSchema = { type: 'string', enum: ['a', 'b'] }

describe('planLayout — single-column gate', () => {
  it('stays single-column with a single field', () => {
    const plan = planLayout(obj({ a: str }))
    expect(plan.singleColumn).toBe(true)
  })

  it('grids whenever two or more fields can pair', () => {
    const plan = planLayout(obj({ a: str, b: str, c: str, d: str }))
    expect(plan.singleColumn).toBe(false)
    expect(plan.cells.every((c) => c.width === 'half')).toBe(true)
  })

  it('grids two pairable scalars even alongside a full-width block (nested-card case)', () => {
    // The array takes its own row and must not count toward "can these pair?", so
    // name + entityType still grid — the same rule applies inside array cards.
    const plan = planLayout(
      obj({ name: str, entityType: str, observations: { type: 'array', items: str } })
    )
    expect(plan.singleColumn).toBe(false)
  })

  it('stays single-column when fewer than two fields can pair', () => {
    const plan = planLayout(
      obj({
        body: { type: 'string', description: 'notes' },
        items: { type: 'array', items: str },
        cfg: { type: 'object', properties: {} },
        only: str
      })
    )
    expect(plan.singleColumn).toBe(true)
  })
})

describe('planLayout — width classification', () => {
  it('uri and long strings are full-width', () => {
    const plan = planLayout(
      obj({
        imageUri: { type: 'string', format: 'uri' },
        token: { type: 'string', maxLength: 500 },
        name: str,
        owner: str
      })
    )
    const width = (n: string): string | undefined => plan.cells.find((c) => c.name === n)?.width
    expect(width('imageUri')).toBe('full')
    expect(width('token')).toBe('full')
    expect(width('name')).toBe('half')
  })

  it('enums and numbers are half-width', () => {
    const plan = planLayout(obj({ environment: en, replicas: num, a: str, b: str }))
    const width = (n: string): string | undefined => plan.cells.find((c) => c.name === n)?.width
    expect(width('environment')).toBe('half')
    expect(width('replicas')).toBe('half')
  })

  it('multi-line strings are full-width', () => {
    const plan = planLayout(
      obj({ notes: { type: 'string', description: 'x' }, a: str, b: str, c: str })
    )
    expect(plan.cells.find((c) => c.name === 'notes')?.width).toBe('full')
  })

  it('untyped / union schemas fall back to full-width rather than breaking', () => {
    const plan = planLayout(
      obj({
        anything: {} as RJSFSchema,
        either: { anyOf: [{ type: 'string' }, { type: 'number' }] } as RJSFSchema,
        a: str,
        b: str
      })
    )
    const width = (n: string): string | undefined => plan.cells.find((c) => c.name === n)?.width
    expect(width('anything')).toBe('full')
    expect(width('either')).toBe('full')
  })
})

describe('planLayout — booleans', () => {
  it('pulls booleans into the band and out of the cells', () => {
    const plan = planLayout(obj({ a: str, b: str, autoRollback: bool, public: bool }))
    expect(plan.booleans).toEqual(['autoRollback', 'public'])
    expect(plan.cells.map((c) => c.name)).not.toContain('autoRollback')
    expect(plan.cells.map((c) => c.name)).not.toContain('public')
  })
})

describe('planLayout — ordering', () => {
  it('required scalars lead, then optional, then textareas, then arrays/objects', () => {
    const plan = planLayout(
      obj(
        {
          notes: { type: 'string', description: 'x' },
          tags: { type: 'array', items: str },
          optName: str,
          reqName: str
        },
        ['reqName']
      )
    )
    expect(plan.cells.map((c) => c.name)).toEqual(['reqName', 'optName', 'notes', 'tags'])
  })

  it('preserves declared order within a bucket', () => {
    const plan = planLayout(obj({ a: str, b: str, c: str, d: str }, ['a', 'b', 'c', 'd']))
    expect(plan.cells.map((c) => c.name)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('isMultilineString', () => {
  it('matches prose-like names without a small maxLength cap', () => {
    expect(isMultilineString({ type: 'string' }, 'description')).toBe(true)
    expect(isMultilineString({ type: 'string' }, 'notes')).toBe(true)
  })

  it('rejects short-capped, uri, enum, and non-prose names', () => {
    expect(isMultilineString({ type: 'string', maxLength: 80 }, 'description')).toBe(false)
    expect(isMultilineString({ type: 'string', format: 'uri' }, 'description')).toBe(false)
    expect(isMultilineString({ type: 'string', enum: ['x'] }, 'description')).toBe(false)
    expect(isMultilineString({ type: 'string' }, 'name')).toBe(false)
  })
})

describe('buildUiSchema', () => {
  it('marks prose strings as textareas, recursing into objects and arrays', () => {
    const ui = buildUiSchema(
      obj({
        name: str,
        notes: { type: 'string', description: 'x' },
        volume: obj({ description: { type: 'string' }, size: str }),
        logs: { type: 'array', items: obj({ message: { type: 'string' } }) }
      })
    )
    expect(ui.notes).toEqual({ 'ui:widget': 'textarea' })
    expect(ui.name).toBeUndefined()
    expect((ui.volume as Record<string, unknown>).description).toEqual({ 'ui:widget': 'textarea' })
    expect(((ui.logs as Record<string, unknown>).items as Record<string, unknown>).message).toEqual(
      { 'ui:widget': 'textarea' }
    )
  })
})
