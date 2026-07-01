import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { completable } from '@modelcontextprotocol/sdk/server/completable.js'

const DEPARTMENT_MEMBERS: Record<string, string[]> = {
  Engineering: ['Alice', 'Bob', 'Charlie'],
  Sales: ['David', 'Eve', 'Frank'],
  Marketing: ['Grace', 'Henry', 'Iris'],
  Support: ['John', 'Kim', 'Lee']
}

export function registerPromptWithCompletions(server: McpServer): void {
  server.registerPrompt(
    'completable-prompt',
    {
      title: 'Team Management',
      description: 'First argument choice narrows values for second argument. Demo/test fixture.',
      argsSchema: {
        department: completable(z.string().describe('Choose the department.'), (value) =>
          ['Engineering', 'Sales', 'Marketing', 'Support'].filter((d) => d.startsWith(value))
        ),
        name: completable(
          z.string().describe('Choose a team member to lead the selected department.'),
          (value, context) => {
            const department = context?.arguments?.['department']
            const members = department ? (DEPARTMENT_MEMBERS[department] ?? []) : []
            return members.filter((n) => n.startsWith(value))
          }
        )
      }
    },
    ({ department, name }) => ({
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: `Please promote ${name} to the head of the ${department} team.` }
        }
      ]
    })
  )
}
