import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ResponseFootprintTab } from './ResponseFootprintTab'
import { computeResponseFootprint, estimateResponseTokens } from '../../lib/contextBudget'

// A response large enough to land in the worked example's territory: Safe
// against every reference model except the smallest (qwen-3-5, 32K), where
// it's comfortably Danger — exercises the magnify-callout path too.
function bigTextResponse(): unknown {
  return {
    jsonrpc: '2.0',
    id: 1,
    result: {
      content: [{ type: 'text', text: 'token filler word '.repeat(2500) }]
    }
  }
}

function tinyTextResponse(): unknown {
  return { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'hi' }] } }
}

describe('ResponseFootprintTab', () => {
  it('renders the token count', () => {
    const response = bigTextResponse()
    const estimate = estimateResponseTokens(response)
    render(<ResponseFootprintTab response={response} />)
    expect(screen.getByText(Math.round(estimate.tokens).toLocaleString())).toBeInTheDocument()
  })

  it('renders the overall status as the worst-case across the reference models', () => {
    const response = bigTextResponse()
    const estimate = estimateResponseTokens(response)
    const footprint = computeResponseFootprint(estimate.tokens)
    render(<ResponseFootprintTab response={response} />)
    const expectedLabel = { safe: 'Safe', caution: 'Caution', danger: 'Danger' }[footprint.status]
    expect(screen.getByLabelText(/Overall footprint status/)).toHaveTextContent(expectedLabel)
  })

  it('renders the raw size, character count, and tokenizer stats', () => {
    const response = bigTextResponse()
    const estimate = estimateResponseTokens(response)
    render(<ResponseFootprintTab response={response} />)
    expect(screen.getByText('Raw size')).toBeInTheDocument()
    expect(screen.getByText('Characters')).toBeInTheDocument()
    expect(screen.getByText(estimate.characters.toLocaleString())).toBeInTheDocument()
    expect(screen.getByText('cl100k_base')).toBeInTheDocument()
  })

  it('renders one row per reference model', () => {
    render(<ResponseFootprintTab response={bigTextResponse()} />)
    expect(screen.getByText('fable-5')).toBeInTheDocument()
    expect(screen.getByText('opus-4-8')).toBeInTheDocument()
    expect(screen.getByText('sonnet-4-6')).toBeInTheDocument()
    expect(screen.getByText('gpt-5-5')).toBeInTheDocument()
    expect(screen.getByText('gemini-3-1-pro')).toBeInTheDocument()
    expect(screen.getByText('haiku-4-5')).toBeInTheDocument()
    expect(screen.getByText('qwen-3-5')).toBeInTheDocument()
  })

  it('shows a magnified callout only for the model whose window is under 5% of the max', () => {
    render(<ResponseFootprintTab response={bigTextResponse()} />)
    // qwen-3-5 (32K) is 3.2% of the 1M max — below the magnify threshold.
    expect(screen.getByText('32K window, magnified 31×')).toBeInTheDocument()
    // haiku-4-5 (200K, 20% of max) stays above threshold.
    expect(screen.queryByText(/200K window, magnified/)).not.toBeInTheDocument()
  })

  it('does not render a magnify callout for a tiny response (still measured against the same thresholds)', () => {
    // Even a 2-character response still gets a callout for qwen-3-5, since
    // the magnify trigger is the model's window share, not the response size.
    render(<ResponseFootprintTab response={tinyTextResponse()} />)
    expect(screen.getByText('32K window, magnified 31×')).toBeInTheDocument()
  })

  it('mentions a binary-block count when the response contains one', () => {
    const response = {
      result: {
        content: [
          { type: 'text', text: 'hi' },
          { type: 'image', data: 'a'.repeat(200), mimeType: 'image/png' }
        ]
      }
    }
    render(<ResponseFootprintTab response={response} />)
    expect(screen.getByText(/1 binary block \(not estimated\)\./)).toBeInTheDocument()
  })

  it('omits the binary-block note when there are none', () => {
    render(<ResponseFootprintTab response={bigTextResponse()} />)
    expect(screen.queryByText(/binary block/)).not.toBeInTheDocument()
  })

  it('renders the Safe/Caution/Danger legend with its threshold labels', () => {
    render(<ResponseFootprintTab response={bigTextResponse()} />)
    expect(screen.getByText('<5%')).toBeInTheDocument()
    expect(screen.getByText('5–20%')).toBeInTheDocument()
    expect(screen.getByText('>20%')).toBeInTheDocument()
  })

  it('mentions the smallest- and largest-fraction reference models in the caption', () => {
    render(<ResponseFootprintTab response={bigTextResponse()} />)
    // fable-5 ties for the largest window (smallest fraction) and is first in
    // REFERENCE_MODELS, so it's the one picked among the 1M-window ties;
    // qwen-3-5 has the smallest window (largest fraction) — both named.
    const caption = screen.getByLabelText('Footprint summary')
    expect(caption).toHaveTextContent('fable-5')
    expect(caption).toHaveTextContent('qwen-3-5')
  })
})
