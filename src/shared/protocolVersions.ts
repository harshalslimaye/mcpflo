// MCP protocol revisions the app can request during the initialize handshake,
// newest first. Re-exported (not copied) so an SDK upgrade that adds or drops a
// revision is picked up automatically — no list to remember to update by hand.
export {
  SUPPORTED_PROTOCOL_VERSIONS as MCP_PROTOCOL_VERSIONS,
  LATEST_PROTOCOL_VERSION as LATEST_MCP_PROTOCOL_VERSION
} from '@modelcontextprotocol/sdk/types.js'
