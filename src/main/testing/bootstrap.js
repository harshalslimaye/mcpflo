// In-VM prelude for the test-engine sandbox (src/main/testing/sandbox.ts).
//
// Evaluation order enforced by the host: chai's UMD bundle, then this file,
// then the user's script. This file must stay plain, import-free script
// syntax (no `import`/`export`) — it's evaluated as a script, not a module.
//
// Builds three globals for the user's script to use: `res` (the call result,
// see the contract in src/shared/testing.types.ts), `expect`/`assert` (Chai,
// already on `globalThis.chai` from the UMD bundle), and `test()`. Also
// captures `console.*` output and exposes `__MCPFLO_COLLECT__` for the host to
// pull results back out as JSON.

// ── res ──────────────────────────────────────────────────────────────────
;(function () {
  // Shared by all three builders' getBody(): JSON-parse the joined text if it
  // parses, else return the raw joined string, else null if there's no text.
  function parseTextOrRaw(text) {
    if (text === '') return null
    try {
      return JSON.parse(text)
    } catch (e) {
      return text
    }
  }

  function buildToolRes(raw) {
    var result = raw.result || {}
    var content = result.content || []

    function getText() {
      var texts = []
      for (var i = 0; i < content.length; i++) {
        var block = content[i]
        if (block && block.type === 'text' && typeof block.text === 'string') {
          texts.push(block.text)
        }
      }
      return texts.join('\n')
    }

    function getBody() {
      if (result.structuredContent !== undefined) return result.structuredContent
      // Falls back to the same full join getText() uses — never drops a
      // block. A single text block behaves exactly as before (join of one
      // item is that item); multiple blocks are joined too, so at worst the
      // JSON.parse fails and the caller gets the complete raw text back, not
      // a truncated first block.
      return parseTextOrRaw(getText())
    }

    function getIsError() {
      return result.isError === true
    }

    function getContent() {
      return content
    }

    function getResponseTime() {
      return raw.callDurationMs
    }

    function getSize() {
      return { body: raw.bodyBytes, total: raw.totalBytes }
    }

    function getRaw() {
      return result
    }

    return {
      get body() {
        return getBody()
      },
      getBody: getBody,
      get isError() {
        return getIsError()
      },
      getIsError: getIsError,
      get content() {
        return getContent()
      },
      getContent: getContent,
      getText: getText,
      get responseTime() {
        return getResponseTime()
      },
      getResponseTime: getResponseTime,
      getSize: getSize,
      get raw() {
        return getRaw()
      },
      getRaw: getRaw
    }
  }

  function buildPromptRes(raw) {
    var result = raw.result || {}
    var messages = result.messages || []

    function getText() {
      var texts = []
      for (var i = 0; i < messages.length; i++) {
        // A message's `content` is a single block, not an array (unlike a
        // tool result's `content`) — see PromptMessage in mcp.types.ts.
        var message = messages[i]
        var block = message && message.content
        if (block && block.type === 'text' && typeof block.text === 'string') {
          texts.push(block.text)
        }
      }
      return texts.join('\n')
    }

    function getBody() {
      return parseTextOrRaw(getText())
    }

    function getMessages() {
      return messages
    }

    function getResponseTime() {
      return raw.callDurationMs
    }

    function getSize() {
      return { body: raw.bodyBytes, total: raw.totalBytes }
    }

    function getRaw() {
      return result
    }

    return {
      get body() {
        return getBody()
      },
      getBody: getBody,
      getText: getText,
      get messages() {
        return getMessages()
      },
      getMessages: getMessages,
      get responseTime() {
        return getResponseTime()
      },
      getResponseTime: getResponseTime,
      getSize: getSize,
      get raw() {
        return getRaw()
      },
      getRaw: getRaw
    }
  }

  function buildResourceRes(raw) {
    var result = raw.result || {}
    var contents = result.contents || []

    function getText() {
      var texts = []
      for (var i = 0; i < contents.length; i++) {
        // Blob-only entries carry no `text` — skipped, same as a tool
        // result's non-text content blocks.
        var entry = contents[i]
        if (entry && typeof entry.text === 'string') {
          texts.push(entry.text)
        }
      }
      return texts.join('\n')
    }

    function getBody() {
      return parseTextOrRaw(getText())
    }

    function getContents() {
      return contents
    }

    function getResponseTime() {
      return raw.callDurationMs
    }

    function getSize() {
      return { body: raw.bodyBytes, total: raw.totalBytes }
    }

    function getRaw() {
      return result
    }

    return {
      get body() {
        return getBody()
      },
      getBody: getBody,
      getText: getText,
      get contents() {
        return getContents()
      },
      getContents: getContents,
      get responseTime() {
        return getResponseTime()
      },
      getResponseTime: getResponseTime,
      getSize: getSize,
      get raw() {
        return getRaw()
      },
      getRaw: getRaw
    }
  }

  var raw = JSON.parse(globalThis.__MCPFLO_DATA__)
  delete globalThis.__MCPFLO_DATA__

  if (raw.kind === 'prompt') {
    globalThis.res = buildPromptRes(raw)
  } else if (raw.kind === 'resource') {
    globalThis.res = buildResourceRes(raw)
  } else {
    globalThis.res = buildToolRes(raw)
  }
})()

// ── assertions ───────────────────────────────────────────────────────────
globalThis.expect = chai.expect
globalThis.assert = chai.assert

// ── console ──────────────────────────────────────────────────────────────
;(function () {
  var logs = []

  function record() {
    var parts = []
    for (var i = 0; i < arguments.length; i++) {
      parts.push(String(arguments[i]))
    }
    logs.push(parts.join(' '))
  }

  globalThis.console = {
    log: record,
    info: record,
    warn: record,
    error: record
  }

  globalThis.__MCPFLO_LOGS__ = logs
})()

// ── test() ───────────────────────────────────────────────────────────────
;(function () {
  var results = []

  // Chai's AssertionError carries `.actual`/`.expected` for value-comparison
  // assertions (`to.equal`, `to.eql`, ...); other assertions (`to.be.a(...)`)
  // don't, so those fields stay absent rather than serializing `undefined`.
  function buildFailure(name, err) {
    var entry = {
      name: name,
      status: 'fail',
      error: err && err.message !== undefined ? String(err.message) : String(err)
    }
    try {
      if (err && err.actual !== undefined) entry.actual = JSON.stringify(err.actual)
    } catch (e) {
      // Non-serializable actual (e.g. circular) — omit rather than fail collection.
    }
    try {
      if (err && err.expected !== undefined) entry.expected = JSON.stringify(err.expected)
    } catch (e) {
      // Same as above, for `expected`.
    }
    return entry
  }

  globalThis.test = function (name, fn) {
    var ret
    try {
      ret = fn()
    } catch (err) {
      results.push(buildFailure(name, err))
      return
    }
    if (ret && typeof ret.then === 'function') {
      // Reserve the slot now so result order matches declaration order. The
      // host pumps the job queue after the script finishes; if this promise
      // never settles by the time it collects, this placeholder is what
      // gets read out.
      var pending = { name: name, status: 'fail', error: 'test did not complete' }
      results.push(pending)
      ret.then(
        function () {
          pending.status = 'pass'
          delete pending.error
        },
        function (err) {
          var failure = buildFailure(name, err)
          pending.status = failure.status
          pending.error = failure.error
          if (failure.actual !== undefined) pending.actual = failure.actual
          if (failure.expected !== undefined) pending.expected = failure.expected
        }
      )
      return
    }
    results.push({ name: name, status: 'pass' })
  }

  globalThis.__MCPFLO_COLLECT__ = function () {
    return JSON.stringify({ results: results, logs: globalThis.__MCPFLO_LOGS__ })
  }
})()
