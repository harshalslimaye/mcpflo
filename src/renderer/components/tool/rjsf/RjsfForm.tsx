import { withTheme, type ThemeProps } from '@rjsf/core'
import { widgets } from './widgets'
import { templates } from './templates'
import { fields } from './fields'

// A single themed RJSF Form, pre-wired with MCPFlo's Tailwind widgets/templates.
// Consumers pass `schema`, `validator`, `formData`, `onChange`, etc.
const theme: ThemeProps = { widgets, templates, fields }

export const RjsfForm = withTheme(theme)
