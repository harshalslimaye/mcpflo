import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

const CONTACT_KINDS = ['email', 'phone', 'slack', 'discord'] as const
const PROFILE_ROLES = ['engineer', 'designer', 'manager', 'student'] as const
const THEMES = ['light', 'dark', 'system'] as const

export function registerComplexProfileIntake(server: McpServer): void {
  server.registerTool(
    'complex-profile-intake',
    {
      description:
        'Collects a nested profile-intake payload to stress-test complex JSON Schema form rendering. Demo/test fixture.',
      inputSchema: {
        fullName: z.string().describe('Legal full name'),
        age: z.number().int().min(13).max(120).describe('Age in years'),
        primaryRole: z.enum(PROFILE_ROLES).describe('Primary role'),
        acceptTerms: z.boolean().describe('Whether the user accepts terms and conditions'),
        bio: z.string().optional().describe('Short profile summary'),
        notes: z.string().optional().describe('Long-form notes for onboarding'),
        contactMethods: z
          .array(
            z.object({
              kind: z.enum(CONTACT_KINDS),
              value: z.string().describe('Address/identifier for this contact method'),
              isPrimary: z.boolean().default(false)
            })
          )
          .min(1)
          .describe('At least one contact method is required'),
        preferences: z.object({
          theme: z.enum(THEMES).default('system'),
          notifications: z.boolean().default(true),
          weeklyHours: z.number().min(0).max(80).default(40),
          favoriteNumbers: z.array(z.number().int()).optional()
        })
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ fullName, age, primaryRole, acceptTerms, bio, notes, contactMethods, preferences }): Promise<CallToolResult> => {
      const primaryContact = contactMethods.find((method) => method.isPrimary) ?? contactMethods[0]
      const favorites = preferences.favoriteNumbers?.join(', ') ?? 'none'

      const summary = [
        `Profile: ${fullName} (${age})`,
        `Role: ${primaryRole}`,
        `Accepted terms: ${acceptTerms}`,
        `Primary contact: ${primaryContact.kind}=${primaryContact.value}`,
        `Theme: ${preferences.theme} | Notifications: ${preferences.notifications} | Weekly hours: ${preferences.weeklyHours}`,
        `Favorite numbers: ${favorites}`,
        `Bio provided: ${Boolean(bio)}`,
        `Notes provided: ${Boolean(notes)}`
      ]

      return {
        content: [{ type: 'text', text: summary.join('\n') }],
        structuredContent: {
          fullName,
          age,
          primaryRole,
          acceptTerms,
          contactMethods,
          preferences,
          hasBio: Boolean(bio),
          hasNotes: Boolean(notes)
        }
      }
    }
  )
}
