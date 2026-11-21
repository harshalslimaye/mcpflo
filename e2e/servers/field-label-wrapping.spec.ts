import { createServer } from 'node:http'
import { test, expect } from '../fixtures'

// A model-free local MCP fixture. Keep the long label plus adjacent short label:
// at the default 900px window these share a narrow two-column Params row.
test('long scalar labels stay within their generated form column', async ({ page }) => {
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405).end()
      return
    }
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    const rpc = JSON.parse(Buffer.concat(chunks).toString())
    if (rpc.id === undefined) {
      res.writeHead(202).end()
      return
    }
    let result: unknown = {}
    if (rpc.method === 'initialize')
      result = {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'field-label-fixture', version: '1.0.0' }
      }
    if (rpc.method === 'tools/list')
      result = {
        tools: [
          {
            name: 'label_fixture',
            description: 'Synthetic form layout fixture',
            inputSchema: {
              type: 'object',
              properties: {
                join_window_hours: { type: 'number', description: 'Synthetic duration' },
                topic: { type: 'string', description: 'Synthetic topic' },
                opening_message: { type: 'string', description: 'Synthetic message' }
              }
            }
          }
        ]
      }
    if (rpc.method === 'resources/list') result = { resources: [] }
    if (rpc.method === 'resources/templates/list') result = { resourceTemplates: [] }
    if (rpc.method === 'prompts/list') result = { prompts: [] }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const { port } = server.address() as import('node:net').AddressInfo
    await page.getByRole('button', { name: 'Add Server', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill('Label fixture')
    await dialog.getByRole('button', { name: 'streamable-http', exact: true }).click()
    await dialog.getByLabel('URL').fill(`http://127.0.0.1:${port}/mcp`)
    await dialog.getByRole('button', { name: 'Add Server', exact: true }).click()
    await page
      .getByRole('group', { name: 'Label fixture' })
      .getByRole('button', { name: 'Expand', exact: true })
      .click()
    const tools = page.getByRole('button', { name: /^Tools/ })
    await expect(tools).toBeEnabled()
    await tools.click()
    await page.getByRole('button', { name: 'label_fixture', exact: true }).click()
    const longLabel = page.locator('label').filter({ hasText: /^join_window_hours$/ })
    await expect(longLabel).toBeVisible()
    const bounds = await longLabel.evaluate((label) => {
      const own = label.getBoundingClientRect()
      const parent = label.parentElement!.getBoundingClientRect()
      return {
        left: own.left,
        right: own.right,
        parentLeft: parent.left,
        parentRight: parent.right
      }
    })
    expect(bounds.left).toBeGreaterThanOrEqual(bounds.parentLeft)
    expect(bounds.right).toBeLessThanOrEqual(bounds.parentRight)
    await expect(page.getByRole('spinbutton', { name: 'join_window_hours' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'topic', exact: true })).toBeVisible()
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    )
  }
})
