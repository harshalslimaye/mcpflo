import { test, expect, openEverythingGroup } from '../../fixtures'

// get-roots-list and trigger-url-elicitation only register when the client
// advertises the roots / elicitation.url capability (see their
// registerXxx functions in packages/server-everything/src/tools). MCPFlo
// deliberately doesn't advertise either in its client capabilities (see
// src/main/mcp/session.ts) — roots has no configuration UI yet, and url
// elicitation isn't implemented — so both tools must never appear in the
// Tools list for the Everything server. This locks that gating in so a
// future capability change is a conscious decision, not an accidental leak
// (or an accidental omission of a tool MCPFlo now does support).
test("hides tools gated behind capabilities MCPFlo doesn't advertise", async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Tools')

  // A known always-registered tool confirms the list actually populated,
  // rather than the absence checks below passing on an empty/unloaded tree.
  await expect(page.getByRole('button', { name: 'echo', exact: true })).toBeVisible()

  await expect(page.getByRole('button', { name: 'get-roots-list', exact: true })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'trigger-url-elicitation', exact: true })
  ).toHaveCount(0)
})
