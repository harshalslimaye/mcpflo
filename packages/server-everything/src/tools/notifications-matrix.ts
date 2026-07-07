import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

const CHANNEL_TYPE = ['email', 'sms', 'push', 'webhook'] as const
const DIGEST_FREQUENCY = ['off', 'daily', 'weekly'] as const
const SEVERITY = ['critical', 'high', 'medium', 'low'] as const
const QUIET_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

const QUIET_HOURS_DEFAULT = {
	enabled: false,
	start: '22:00',
	end: '07:00',
	timezone: 'UTC',
	days: ['sat', 'sun'] as Array<(typeof QUIET_DAYS)[number]>
}

const CHANNEL_SCHEMA = z.object({
	type: z.enum(CHANNEL_TYPE),
	target: z.string().describe('Destination identifier, e.g. email address, phone number, URL'),
	enabled: z.boolean().default(true),
	severities: z.array(z.enum(SEVERITY)).min(1).default(['critical', 'high'])
})

const RULE_SCHEMA = z.object({
	eventType: z.string().describe('Event key, e.g. build.failed or deploy.completed'),
	channelTypes: z.array(z.enum(CHANNEL_TYPE)).min(1),
	minSeverity: z.enum(SEVERITY).default('medium')
})

const NOTIFICATIONS_MATRIX_SCHEMA = z.object({
	globalEnabled: z.boolean().default(true),
	digestFrequency: z.enum(DIGEST_FREQUENCY).default('daily'),
	maxPerHour: z.number().int().min(1).max(1000).default(100),
	quietHours: z
		.object({
			enabled: z.boolean().default(false),
			start: z.string().default('22:00').describe('24h start time'),
			end: z.string().default('07:00').describe('24h end time'),
			timezone: z.string().default('UTC'),
			days: z.array(z.enum(QUIET_DAYS)).default(['sat', 'sun'])
		})
		.default(QUIET_HOURS_DEFAULT)
		.describe('Optional schedule that suppresses notifications during selected windows'),
	channels: z.array(CHANNEL_SCHEMA).min(1),
	routingRules: z.array(RULE_SCHEMA).default([])
})

export function registerNotificationsMatrix(server: McpServer): void {
	server.registerTool(
		'notifications-matrix',
		{
			description:
				'Configures nested notification settings with channels, schedules, and routing rules to stress-test deep object/array form rendering. Demo/test fixture.',
			inputSchema: {
				profileId: z.string().describe('Profile identifier for this notification matrix'),
				matrix: NOTIFICATIONS_MATRIX_SCHEMA,
				dryRun: z.boolean().default(true).describe('Return computed summary without side effects')
			},
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false
			}
		},
		async ({ profileId, matrix, dryRun }): Promise<CallToolResult> => {
			const enabledChannels = matrix.channels.filter((channel) => channel.enabled)
			const quietHoursState = matrix.quietHours.enabled
				? `${matrix.quietHours.start}-${matrix.quietHours.end} ${matrix.quietHours.timezone}`
				: 'disabled'

			const lines = [
				`Profile: ${profileId}`,
				`Dry run: ${dryRun}`,
				`Global enabled: ${matrix.globalEnabled}`,
				`Digest: ${matrix.digestFrequency}`,
				`Max per hour: ${matrix.maxPerHour}`,
				`Quiet hours: ${quietHoursState}`,
				`Channels: total=${matrix.channels.length}, enabled=${enabledChannels.length}`,
				`Routing rules: ${matrix.routingRules.length}`
			]

			for (const channel of matrix.channels) {
				lines.push(
					`- channel ${channel.type} target=${channel.target} enabled=${channel.enabled} severities=[${channel.severities.join(', ')}]`
				)
			}
			for (const rule of matrix.routingRules) {
				lines.push(
					`- rule ${rule.eventType} via=[${rule.channelTypes.join(', ')}] minSeverity=${rule.minSeverity}`
				)
			}

			return {
				content: [{ type: 'text', text: lines.join('\n') }],
				structuredContent: {
					profileId,
					dryRun,
					matrix,
					totals: {
						channels: matrix.channels.length,
						enabledChannels: enabledChannels.length,
						rules: matrix.routingRules.length
					}
				}
			}
		}
	)
}
