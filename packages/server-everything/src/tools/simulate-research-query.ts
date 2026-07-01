import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type {
  CallToolResult,
  GetTaskResult,
  Task,
  ElicitResult
} from '@modelcontextprotocol/sdk/types.js'
import { ElicitResultSchema } from '@modelcontextprotocol/sdk/types.js'
import type {
  CreateTaskResult,
  CreateTaskRequestHandlerExtra
} from '@modelcontextprotocol/sdk/experimental/tasks/index.js'

const STAGES = ['Gathering sources', 'Analyzing content', 'Synthesizing findings', 'Generating report']
const STAGE_DURATION = 1000

interface ResearchState {
  topic: string
  ambiguous: boolean
  currentStage: number
  clarification?: string
  completed: boolean
  result?: CallToolResult
}

const researchStates = new Map<string, ResearchState>()

async function runResearchProcess(
  taskId: string,
  taskStore: CreateTaskRequestHandlerExtra['taskStore'],
  sendRequest: CreateTaskRequestHandlerExtra['sendRequest']
): Promise<void> {
  const state = researchStates.get(taskId)
  if (!state) return

  for (let i = state.currentStage; i < STAGES.length; i++) {
    state.currentStage = i

    if (state.completed) return

    await taskStore.updateTaskStatus(taskId, 'working', `${STAGES[i]}...`)

    if (i === 2 && state.ambiguous && !state.clarification) {
      await taskStore.updateTaskStatus(
        taskId,
        'input_required',
        `Found multiple interpretations for "${state.topic}". Requesting clarification...`
      )

      try {
        const elicitResult = (await sendRequest(
          {
            method: 'elicitation/create',
            params: {
              message: `The research query "${state.topic}" could have multiple interpretations. Please clarify what you're looking for:`,
              requestedSchema: {
                type: 'object',
                properties: {
                  interpretation: {
                    type: 'string',
                    title: 'Clarification',
                    description: 'Which interpretation of the topic do you mean?',
                    oneOf: getInterpretationsForTopic(state.topic)
                  }
                },
                required: ['interpretation']
              }
            }
          },
          ElicitResultSchema
        )) as ElicitResult

        if (elicitResult.action === 'accept' && elicitResult.content) {
          state.clarification =
            (elicitResult.content as { interpretation?: string }).interpretation ||
            'User accepted without selection'
        } else if (elicitResult.action === 'decline') {
          state.clarification = 'User declined - using default interpretation'
        } else {
          state.clarification = 'User cancelled - using default interpretation'
        }
      } catch (error) {
        console.warn(
          `Elicitation failed for task ${taskId}:`,
          error instanceof Error ? error.message : String(error)
        )
        state.clarification = 'technical (default - elicitation unavailable)'
      }

      await taskStore.updateTaskStatus(
        taskId,
        'working',
        `Continuing with interpretation: "${state.clarification}"...`
      )
    }

    await new Promise((resolve) => setTimeout(resolve, STAGE_DURATION))
  }

  state.completed = true
  const result = generateResearchReport(state)
  state.result = result

  await taskStore.storeTaskResult(taskId, 'completed', result)
}

function generateResearchReport(state: ResearchState): CallToolResult {
  const topic = state.clarification ? `${state.topic} (${state.clarification})` : state.topic

  const report = `# Research Report: ${topic}

## Research Parameters
- **Topic**: ${state.topic}
${state.clarification ? `- **Clarification**: ${state.clarification}` : ''}

## Synthesis
This research query was processed through ${STAGES.length} stages:
${STAGES.map((s, i) => `- Stage ${i + 1}: ${s} ✓`).join('\n')}

---

## About This Demo (SEP-1686: Tasks)

This tool demonstrates MCP's task-based execution pattern for long-running operations:

**Task Lifecycle Demonstrated:**
1. \`tools/call\` with \`task\` parameter → Server returns \`CreateTaskResult\` (not the final result)
2. Client polls \`tasks/get\` → Server returns current status and \`statusMessage\`
3. Status progressed: \`working\` → ${state.clarification ? '`input_required` → `working` → ' : ''}\`completed\`
4. Client calls \`tasks/result\` → Server returns this final result

${
  state.clarification
    ? `**Elicitation Flow:**
When the query was ambiguous, the server sent an \`elicitation/create\` request
to the client. The task status changed to \`input_required\` while awaiting user input.
${
  state.clarification.includes('unavailable')
    ? '**Note:** Elicitation failed and a default interpretation was used.'
    : `After receiving clarification ("${state.clarification}"), the task resumed processing and completed.`
}
`
    : ''
}
**Key Concepts:**
- Tasks enable "call now, fetch later" patterns
- \`statusMessage\` provides human-readable progress updates
- Tasks have TTL (time-to-live) for automatic cleanup
- \`pollInterval\` suggests how often to check status
- Elicitation requests use \`relatedTask\` to queue via tasks/result (works on all transports)

*This is a simulated research report. Demo/test fixture.*
`

  return { content: [{ type: 'text', text: report }] }
}

function getInterpretationsForTopic(topic: string): Array<{ const: string; title: string }> {
  const lowerTopic = topic.toLowerCase()

  if (lowerTopic.includes('python')) {
    return [
      { const: 'programming', title: 'Python programming language' },
      { const: 'snake', title: 'Python snake species' },
      { const: 'comedy', title: 'Monty Python comedy group' }
    ]
  }

  return [
    { const: 'technical', title: 'Technical/scientific perspective' },
    { const: 'historical', title: 'Historical perspective' },
    { const: 'current', title: 'Current events/news perspective' }
  ]
}

export function registerSimulateResearchQuery(server: McpServer): void {
  // Called from server.server.oninitialized (see index.ts), so the client's
  // capabilities are already known here — computed once, not per-call, since
  // capabilities don't change for the life of a session.
  const clientCapabilities = server.server.getClientCapabilities() ?? {}
  const clientSupportsElicitation = clientCapabilities.elicitation !== undefined

  server.experimental.tasks.registerToolTask(
    'simulate-research-query',
    {
      description:
        'Simulates a deep research operation that gathers, analyzes, and synthesizes information. ' +
        "Demonstrates MCP task-based operations with progress through multiple stages. If 'ambiguous' " +
        'is true and the client supports elicitation, sends an elicitation request for clarification. ' +
        'Demo/test fixture.',
      inputSchema: {
        topic: z.string().describe('The research topic to investigate'),
        ambiguous: z
          .boolean()
          .default(false)
          .describe('Simulate an ambiguous query that requires clarification (triggers input_required status)')
      },
      execution: { taskSupport: 'required' },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    {
      createTask: async (args, extra): Promise<CreateTaskResult> => {
        const task = await extra.taskStore.createTask({ ttl: 300000, pollInterval: 1000 })

        const state: ResearchState = {
          topic: args.topic,
          ambiguous: args.ambiguous && clientSupportsElicitation,
          currentStage: 0,
          completed: false
        }
        researchStates.set(task.taskId, state)

        runResearchProcess(task.taskId, extra.taskStore, extra.sendRequest).catch((error: unknown) => {
          console.error(`Research task ${task.taskId} failed:`, error)
          extra.taskStore.updateTaskStatus(task.taskId, 'failed', String(error)).catch(console.error)
        })

        return { task }
      },

      getTask: async (_args, extra): Promise<GetTaskResult> => {
        return await extra.taskStore.getTask(extra.taskId)
      },

      getTaskResult: async (_args, extra): Promise<CallToolResult> => {
        const result = await extra.taskStore.getTaskResult(extra.taskId)
        researchStates.delete(extra.taskId)
        return result as CallToolResult
      }
    }
  )
}
