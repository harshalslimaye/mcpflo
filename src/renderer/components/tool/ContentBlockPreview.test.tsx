import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ContentBlockPreview, ResultPreview } from './ContentBlockPreview'
import type { ToolCallResult } from '../../../shared/mcp.types'

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('ContentBlockPreview — text blocks', () => {
  it('renders plain text with whitespace preserved', () => {
    const { container } = render(
      <ContentBlockPreview block={{ type: 'text', text: 'line one\n  indented\nline three' }} />
    )
    expect(screen.getByText('text')).toBeInTheDocument()
    const body = container.querySelector('.whitespace-pre-wrap')
    expect(body?.textContent).toBe('line one\n  indented\nline three')
  })

  it('pretty-prints text that parses as JSON in a monospace block', () => {
    const { container } = render(
      <ContentBlockPreview block={{ type: 'text', text: '{"a":1,"b":[true,null]}' }} />
    )
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre?.textContent).toContain('"a": 1')
    expect(pre?.textContent).toContain('"b": [')
  })

  it('leaves JSON-looking but invalid text as plain text', () => {
    const { container } = render(
      <ContentBlockPreview block={{ type: 'text', text: '{not json at all' }} />
    )
    expect(container.querySelector('pre')).toBeNull()
    expect(screen.getByText('{not json at all')).toBeInTheDocument()
  })

  it('does not pretty-print scalar JSON like a bare number string', () => {
    const { container } = render(<ContentBlockPreview block={{ type: 'text', text: '42' }} />)
    expect(container.querySelector('pre')).toBeNull()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('pretty-prints text that parses as a JSON array', () => {
    const { container } = render(
      <ContentBlockPreview block={{ type: 'text', text: '[1,{"a":2}]' }} />
    )
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre?.textContent).toContain('"a": 2')
  })

  it('renders a text block with missing text as an empty card', () => {
    const { container } = render(<ContentBlockPreview block={{ type: 'text' }} />)
    expect(screen.getByText('text')).toBeInTheDocument()
    expect(container.querySelector('.whitespace-pre-wrap')?.textContent).toBe('')
  })
})

describe('ContentBlockPreview — image blocks', () => {
  it('renders a data-URI img', () => {
    render(<ContentBlockPreview block={{ type: 'image', data: PNG_B64, mimeType: 'image/png' }} />)
    const img = screen.getByAltText('Tool result image') as HTMLImageElement
    expect(img.src).toBe(`data:image/png;base64,${PNG_B64}`)
    expect(screen.getByText('image')).toBeInTheDocument()
  })

  it('falls back to a card with mimeType and size when the image fails to load', () => {
    render(<ContentBlockPreview block={{ type: 'image', data: PNG_B64, mimeType: 'image/png' }} />)
    fireEvent.error(screen.getByAltText('Tool result image'))
    expect(screen.queryByAltText('Tool result image')).not.toBeInTheDocument()
    expect(screen.getByText(/Image failed to render/)).toBeInTheDocument()
    expect(screen.getByText('— image/png · 0 KB')).toBeInTheDocument()
  })

  it('falls back immediately when data is missing, without an error event', () => {
    render(<ContentBlockPreview block={{ type: 'image', mimeType: 'image/png' }} />)
    expect(screen.queryByAltText('Tool result image')).not.toBeInTheDocument()
    expect(screen.getByText(/Image failed to render/)).toBeInTheDocument()
  })

  it('defaults the data URI to image/png and labels a missing mimeType in the fallback', () => {
    render(<ContentBlockPreview block={{ type: 'image', data: PNG_B64 }} />)
    const img = screen.getByAltText('Tool result image') as HTMLImageElement
    expect(img.src).toBe(`data:image/png;base64,${PNG_B64}`)
    fireEvent.error(img)
    expect(screen.getByText('— unknown type · 0 KB')).toBeInTheDocument()
  })
})

describe('ContentBlockPreview — audio blocks', () => {
  it('renders an audio element with controls and falls back on error', () => {
    render(<ContentBlockPreview block={{ type: 'audio', data: 'AAAA', mimeType: 'audio/wav' }} />)
    const audio = screen.getByLabelText('Tool result audio') as HTMLAudioElement
    expect(audio.src).toBe('data:audio/wav;base64,AAAA')
    expect(audio).toHaveAttribute('controls')
    fireEvent.error(audio)
    expect(screen.getByText(/Audio failed to render/)).toBeInTheDocument()
  })

  it('falls back immediately when data is missing and defaults the mimeType to audio/wav', () => {
    render(<ContentBlockPreview block={{ type: 'audio' }} />)
    expect(screen.queryByLabelText('Tool result audio')).not.toBeInTheDocument()
    expect(screen.getByText(/Audio failed to render/)).toBeInTheDocument()

    render(<ContentBlockPreview block={{ type: 'audio', data: 'AAAA' }} />)
    const audio = screen.getByLabelText('Tool result audio') as HTMLAudioElement
    expect(audio.src).toBe('data:audio/wav;base64,AAAA')
  })
})

describe('ContentBlockPreview — resource blocks', () => {
  it('renders uri, mimeType and text body (with JSON detection)', () => {
    const { container } = render(
      <ContentBlockPreview
        block={{
          type: 'resource',
          resource: {
            uri: 'file:///tmp/data.json',
            mimeType: 'application/json',
            text: '{"key":"value"}'
          }
        }}
      />
    )
    expect(screen.getByText('resource')).toBeInTheDocument()
    expect(screen.getByText('file:///tmp/data.json')).toBeInTheDocument()
    expect(screen.getByText('application/json')).toBeInTheDocument()
    expect(container.querySelector('pre')?.textContent).toContain('"key": "value"')
  })

  it('renders binary resources as a size summary, not the blob', () => {
    const blob = 'A'.repeat(4096) // ~3 KB decoded
    render(
      <ContentBlockPreview block={{ type: 'resource', resource: { uri: 'file:///bin', blob } }} />
    )
    expect(screen.getByText('Binary resource · 3 KB')).toBeInTheDocument()
  })

  it('shows an empty state when the resource field is missing entirely', () => {
    render(<ContentBlockPreview block={{ type: 'resource' }} />)
    expect(screen.getByText('resource')).toBeInTheDocument()
    expect(screen.getByText('Empty resource')).toBeInTheDocument()
  })

  it('shows an empty state when the resource has neither text nor blob', () => {
    render(<ContentBlockPreview block={{ type: 'resource', resource: { uri: 'file:///x' } }} />)
    expect(screen.getByText('file:///x')).toBeInTheDocument()
    expect(screen.getByText('Empty resource')).toBeInTheDocument()
  })

  it('prefers text over blob when a resource carries both', () => {
    render(
      <ContentBlockPreview
        block={{ type: 'resource', resource: { uri: 'file:///x', text: 'readable', blob: 'AAAA' } }}
      />
    )
    expect(screen.getByText('readable')).toBeInTheDocument()
    expect(screen.queryByText(/Binary resource/)).not.toBeInTheDocument()
  })
})

describe('ContentBlockPreview — resource_link blocks', () => {
  it('renders name, uri, mimeType and description without fetching anything', () => {
    render(
      <ContentBlockPreview
        block={{
          type: 'resource_link',
          name: 'Server logs',
          uri: 'file:///var/log/app.log',
          mimeType: 'text/plain',
          description: 'Rolling application log'
        }}
      />
    )
    expect(screen.getByText('resource_link')).toBeInTheDocument()
    expect(screen.getByText('Server logs')).toBeInTheDocument()
    expect(screen.getByText('file:///var/log/app.log')).toBeInTheDocument()
    expect(screen.getByText('text/plain')).toBeInTheDocument()
    expect(screen.getByText('Rolling application log')).toBeInTheDocument()
  })

  it('renders a link with only a uri, omitting the optional fields', () => {
    const { container } = render(
      <ContentBlockPreview block={{ type: 'resource_link', uri: 'file:///only-uri' }} />
    )
    expect(screen.getByText('file:///only-uri')).toBeInTheDocument()
    // No name heading is rendered when the link has no name.
    expect(container.querySelector('.text-sm.font-medium')).toBeNull()
  })
})

describe('ContentBlockPreview — unknown types', () => {
  it('renders an unknown badge and the full block JSON', () => {
    const { container } = render(
      <ContentBlockPreview block={{ type: 'video', src: 'somewhere' }} />
    )
    expect(screen.getByText('unknown: video')).toBeInTheDocument()
    expect(container.querySelector('pre')?.textContent).toContain('"src": "somewhere"')
  })

  it('contains a block whose rendering throws instead of blanking the panel', () => {
    // JSON.stringify on a circular block throws inside the unknown-type body.
    const circular: Record<string, unknown> = { type: 'mystery' }
    circular.self = circular
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ContentBlockPreview block={circular as { type: string }} />)
    expect(screen.getByText('This content block failed to render.')).toBeInTheDocument()
    spy.mockRestore()
  })
})

describe('ResultPreview — result-level handling', () => {
  it('renders multi-block results in server order, one card each', () => {
    const result: ToolCallResult = {
      content: [
        { type: 'text', text: 'Here is the chart:' },
        { type: 'image', data: PNG_B64, mimeType: 'image/png' }
      ]
    }
    const { container } = render(<ResultPreview result={result} />)
    const badges = [...container.querySelectorAll('span')]
      .map((s) => s.textContent)
      .filter((t) => t === 'text' || t === 'image')
    expect(badges).toEqual(['text', 'image'])
    expect(screen.getByText('Here is the chart:')).toBeInTheDocument()
    expect(screen.getByAltText('Tool result image')).toBeInTheDocument()
  })

  it('shows an empty state for an empty content array', () => {
    render(<ResultPreview result={{ content: [] }} />)
    expect(screen.getByText('No content returned.')).toBeInTheDocument()
  })

  it('treats missing content as empty without crashing', () => {
    render(<ResultPreview result={{}} />)
    expect(screen.getByText('No content returned.')).toBeInTheDocument()
  })

  it('wraps isError results in error styling but still renders the blocks', () => {
    const { container } = render(
      <ResultPreview
        result={{ isError: true, content: [{ type: 'text', text: 'Division by zero' }] }}
      />
    )
    expect(screen.getByText('Division by zero')).toBeInTheDocument()
    expect(container.querySelector('.border-red-500\\/40')).not.toBeNull()
  })

  it('appends a structured output card after the blocks', () => {
    const { container } = render(
      <ResultPreview
        result={{
          content: [{ type: 'text', text: 'done' }],
          structuredContent: { temperature: 21.5 }
        }}
      />
    )
    expect(screen.getByText('structured output')).toBeInTheDocument()
    expect(container.textContent).toContain('"temperature": 21.5')
    // Structured card comes after the content blocks.
    const cards = [...container.querySelectorAll('span')].map((s) => s.textContent)
    expect(cards.indexOf('text')).toBeLessThan(cards.indexOf('structured output'))
  })

  it('keeps rendering sibling blocks when one block throws', () => {
    const circular: Record<string, unknown> = { type: 'mystery' }
    circular.self = circular
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ResultPreview
        result={{
          content: [
            { type: 'text', text: 'before' },
            circular as { type: string },
            { type: 'text', text: 'after' }
          ]
        }}
      />
    )
    expect(screen.getByText('before')).toBeInTheDocument()
    expect(screen.getByText('This content block failed to render.')).toBeInTheDocument()
    expect(screen.getByText('after')).toBeInTheDocument()
    spy.mockRestore()
  })

  it('wraps the empty state in error styling when isError with no content', () => {
    const { container } = render(<ResultPreview result={{ isError: true, content: [] }} />)
    expect(screen.getByText('No content returned.')).toBeInTheDocument()
    expect(container.querySelector('.border-red-500\\/40')).not.toBeNull()
  })

  it('renders the structured card alongside the empty state when content is missing', () => {
    render(<ResultPreview result={{ structuredContent: { ok: true } }} />)
    expect(screen.getByText('No content returned.')).toBeInTheDocument()
    expect(screen.getByText('structured output')).toBeInTheDocument()
  })

  it('degrades unstringifiable structured output to a card instead of blanking', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ResultPreview
        result={{ content: [{ type: 'text', text: 'still here' }], structuredContent: circular }}
      />
    )
    expect(screen.getByText('still here')).toBeInTheDocument()
    expect(screen.getByText('This content block failed to render.')).toBeInTheDocument()
    spy.mockRestore()
  })
})
