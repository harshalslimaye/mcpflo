import { describe, it, expect } from 'vitest'
import { capResponse, pushCapped, HISTORY_LIMIT_PER_KEY, RESPONSE_BUDGET } from './historyRecord'

describe('capResponse', () => {
  it('keeps a response within budget unchanged', () => {
    const response = { result: { ok: true } }
    expect(capResponse(response)).toEqual({ response, truncated: false })
  })

  it('drops and flags a response over budget', () => {
    const response = { result: { blob: 'x'.repeat(RESPONSE_BUDGET) } }
    expect(capResponse(response)).toEqual({ response: undefined, truncated: true })
  })

  it('keeps a non-serializable response as-is without flagging', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(capResponse(cyclic)).toEqual({ response: cyclic, truncated: false })
  })

  it('bypasses the budget for an oversized ui:// resource-read result', () => {
    const response = {
      result: {
        contents: [{ uri: 'ui://github-mcp-server/issue-write', text: 'x'.repeat(RESPONSE_BUDGET) }]
      }
    }
    expect(capResponse(response)).toEqual({ response, truncated: false })
  })

  it('bypasses the budget for an oversized mcp-app resource block in a tool result', () => {
    const response = {
      result: {
        content: [
          {
            type: 'resource',
            resource: {
              uri: 'https://example.com/widget',
              mimeType: 'text/html;profile=mcp-app',
              text: 'x'.repeat(RESPONSE_BUDGET)
            }
          }
        ]
      }
    }
    expect(capResponse(response)).toEqual({ response, truncated: false })
  })

  it('still caps an oversized plain JSON resource-read result', () => {
    const response = {
      result: { contents: [{ uri: 'file:///big.json', text: 'x'.repeat(RESPONSE_BUDGET) }] }
    }
    expect(capResponse(response)).toEqual({ response: undefined, truncated: true })
  })
})

describe('pushCapped', () => {
  it('prepends newest-first and treats a missing list as empty', () => {
    expect(pushCapped(undefined, 'a')).toEqual(['a'])
    expect(pushCapped(['a'], 'b')).toEqual(['b', 'a'])
  })

  it('caps the list at HISTORY_LIMIT_PER_KEY, dropping the oldest', () => {
    let list: number[] = []
    for (let i = 0; i < HISTORY_LIMIT_PER_KEY + 10; i++) {
      list = pushCapped(list, i)
    }
    expect(list).toHaveLength(HISTORY_LIMIT_PER_KEY)
    // Newest is the last pushed; oldest retained is bounded by the cap.
    expect(list[0]).toBe(HISTORY_LIMIT_PER_KEY + 9)
    expect(list[HISTORY_LIMIT_PER_KEY - 1]).toBe(10)
  })
})
