import { describe, it, expect } from 'vitest'
import {
  buildResourceTemplateSchema,
  buildResourceTemplateUiSchema,
  isResourceTemplateEmpty
} from './resourceTemplateSchema'
import type { ResourceTemplate } from '../../shared/mcp.types'

const template = (uriTemplate: string): ResourceTemplate => ({ uriTemplate })

describe('buildResourceTemplateSchema', () => {
  it('maps each variable to a string property', () => {
    const schema = buildResourceTemplateSchema(template('repo://{owner}/{repo}/tree'))
    expect(schema.type).toBe('object')
    expect(schema.properties).toEqual({
      owner: { type: 'string' },
      repo: { type: 'string' }
    })
  })

  it('marks every variable required', () => {
    const schema = buildResourceTemplateSchema(template('repo://{owner}/{repo}'))
    expect(schema.required).toEqual(['owner', 'repo'])
  })

  it('declares a repeated variable once', () => {
    const schema = buildResourceTemplateSchema(template('repo://{owner}/{owner}'))
    expect(Object.keys(schema.properties ?? {})).toEqual(['owner'])
    expect(schema.required).toEqual(['owner'])
  })

  it('reads the RFC operator forms as ordinary variables', () => {
    const schema = buildResourceTemplateSchema(template('s://x{?query}'))
    expect(schema.properties).toEqual({ query: { type: 'string' } })
  })

  it('produces an empty-properties object for a template with no variables', () => {
    const schema = buildResourceTemplateSchema(template('mem://static'))
    expect(schema.properties).toEqual({})
    expect(schema.required).toBeUndefined()
  })

  it('produces an empty schema for a malformed template rather than throwing', () => {
    const schema = buildResourceTemplateSchema(template('mem://{unclosed'))
    expect(schema.properties).toEqual({})
    expect(schema.required).toBeUndefined()
  })
})

describe('isResourceTemplateEmpty', () => {
  it('is false when there is something to fill in', () => {
    expect(isResourceTemplateEmpty(template('mem://text/{id}'))).toBe(false)
  })

  it('is true for an already-concrete uri', () => {
    expect(isResourceTemplateEmpty(template('mem://static'))).toBe(true)
  })

  it('is true for a malformed template, which has no form to offer', () => {
    expect(isResourceTemplateEmpty(template('mem://{unclosed'))).toBe(true)
  })
})

describe('buildResourceTemplateUiSchema', () => {
  it('assigns the completion widget to every variable when completions are supported', () => {
    const ui = buildResourceTemplateUiSchema(template('repo://{owner}/{repo}'), {
      completions: true
    })
    expect(ui.owner).toEqual({ 'ui:widget': 'CompletionWidget' })
    expect(ui.repo).toEqual({ 'ui:widget': 'CompletionWidget' })
  })

  it('assigns no widget at all when completions are not supported', () => {
    const ui = buildResourceTemplateUiSchema(template('repo://{owner}'), { completions: false })
    expect(ui).toEqual({})
  })

  it('keeps a prose-named variable a single-line input', () => {
    // The Tool and Prompt forms turn names like these into textareas. A URI
    // component is never prose, whatever it happens to be called.
    const ui = buildResourceTemplateUiSchema(template('mem://note/{content}/{description}'), {
      completions: true
    })
    expect(ui.content).toEqual({ 'ui:widget': 'CompletionWidget' })
    expect(ui.description).toEqual({ 'ui:widget': 'CompletionWidget' })
  })

  it('is empty for a template with no variables', () => {
    expect(buildResourceTemplateUiSchema(template('mem://static'), { completions: true })).toEqual(
      {}
    )
  })
})
