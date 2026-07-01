import { shell } from 'electron'

// shell.openExternal hands the URL to the OS to open with whatever's
// registered for its scheme — the system browser for http(s), but any
// registered custom protocol handler for anything else. Electron's own docs
// warn against feeding it unsanitized input: on Windows this class of bug has
// led to RCE via ShellExecute argument injection, and on any OS it can invoke
// another installed app's URL handler with attacker-chosen data.
//
// Two of the three call sites in this app receive URLs that aren't purely
// user intent: the OAuth authorization_endpoint comes from the MCP server's
// own discovery metadata, and window-open/navigation targets can come from
// rendered MCP tool/resource content. So every call site funnels through
// here rather than calling shell.openExternal directly, and only https: (plus
// http: for the local OAuth loopback callback) is allowed through.
function isAllowedExternalUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol === 'https:') return true
  if (parsed.protocol === 'http:') {
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1'
  }
  return false
}

// Opens a URL in the user's system browser, but only if it's https: (or
// http: to loopback, for the OAuth callback flow). Anything else — file:,
// javascript:, data:, arbitrary custom schemes — is silently dropped rather
// than handed to the OS.
export function openExternalSafely(url: string): void {
  if (!isAllowedExternalUrl(url)) return
  void shell.openExternal(url)
}
