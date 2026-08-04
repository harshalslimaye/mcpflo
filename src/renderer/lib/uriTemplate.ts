import { UriTemplate } from '@modelcontextprotocol/sdk/shared/uriTemplate.js'

// RFC 6570 expansion for resource templates, done with the SDK's own
// UriTemplate rather than a regex. A hand-rolled `/\{(\w+)\}/g` would cover
// the simple `{var}` case every server actually uses and quietly mangle the
// rest of the grammar — `{?query}`, `{+path}`, `{/segments*}` — including the
// per-operator encoding rules, which decide whether a `/` in a value stays a
// separator or becomes %2F.
//
// Everything here treats the template as untrusted input: it arrives over the
// wire from a server that can send anything, so a malformed one has to read as
// "no variables" or "couldn't expand", never as a thrown error that takes the
// detail view down with it.

// The distinct variable names a template declares, in the order they appear.
// Empty for a template that doesn't parse, and for one that genuinely has no
// variables — callers can't distinguish the two from this alone, and don't
// need to: both mean "there is no form to build".
//
// Deduplicated because a name may legitimately appear twice (`repo://{o}/{o}`)
// and the caller wants one form field per name, not one per occurrence.
export function templateVariables(uriTemplate: string): string[] {
  try {
    return [...new Set(new UriTemplate(uriTemplate).variableNames)]
  } catch {
    return []
  }
}

export type TemplateExpansion = { ok: true; uri: string } | { ok: false; error: string }

// Fills a template's variables in to get a concrete URI to read.
//
// Every variable is required. RFC 6570 does have genuinely optional forms —
// `{?q}` expands to nothing when `q` is absent — but MCP servers in practice
// declare simple path variables, and a resource read against a URI with a hole
// in it fails in a way that's much harder to explain than "fill this in".
// Revisit if a real server turns up that needs the optional case.
//
// Blank counts as missing for the same reason: `mem://text/{id}` with an empty
// id expands to `mem://text/`, which is a valid URI and almost certainly not
// what the user meant. Whitespace-only is blank; a value with spaces *around*
// something is passed through untouched, since trimming it would silently
// change what the user asked to read.
export function expandTemplate(
  uriTemplate: string,
  values: Record<string, string>
): TemplateExpansion {
  let template: UriTemplate
  try {
    template = new UriTemplate(uriTemplate)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  const missing = [...new Set(template.variableNames)].filter(
    (name) => (values[name] ?? '').trim() === ''
  )
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing ${missing.length === 1 ? 'a value' : 'values'} for ${missing.join(', ')}`
    }
  }

  try {
    return { ok: true, uri: template.expand(values) }
  } catch (err) {
    // expand() enforces its own length limits on values, so a paste of
    // something enormous lands here rather than as an unhandled rejection.
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
