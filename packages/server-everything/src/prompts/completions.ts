import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { completable } from '@modelcontextprotocol/sdk/server/completable.js'
import { completeDepartment, completeMember } from '../data/team'

export function registerPromptWithCompletions(server: McpServer): void {
  server.registerPrompt(
    'completable-prompt',
    {
      title: 'Team Management',
      description: 'First argument choice narrows values for second argument. Demo/test fixture.',
      argsSchema: {
        department: completable(z.string().describe('Choose the department.'), (value) =>
          completeDepartment(value)
        ),
        name: completable(
          z.string().describe('Choose a team member to lead the selected department.'),
          (value, context) => completeMember(value, context?.arguments?.['department'])
        )
      }
    },
    ({ department, name }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please promote ${name} to the head of the ${department} team.`
          }
        }
      ]
    })
  )
}
