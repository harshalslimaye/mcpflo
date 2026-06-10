import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SchemaTab } from './SchemaTab'
import type { ToolInputSchema } from '../../../shared/mcp.types'

const schema: ToolInputSchema = {
  type: 'object',
  properties: { query: { type: 'string' } },
  required: ['query']
}

describe('SchemaTab', () => {
  it('pretty-prints the raw inputSchema in a monospace pre block', () => {
    const { container } = render(<SchemaTab schema={schema} />)
    const pre = container.querySelector('pre')
    expect(pre).toBeInTheDocument()
    expect(pre?.className).toContain('font-mono')
    expect(pre?.textContent).toBe(JSON.stringify(schema, null, 2))
  })

  it('includes a property name from the schema', () => {
    render(<SchemaTab schema={schema} />)
    expect(screen.getByText(/"query"/)).toBeInTheDocument()
  })
})
