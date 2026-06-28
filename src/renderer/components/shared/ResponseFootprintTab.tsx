import { useMemo } from 'react'
import { estimateResponseTokens } from '../../lib/contextBudget'
import { TokenFootprintView } from './TokenFootprintView'

interface ResponseFootprintTabProps {
  response: unknown
}

// The Tokens tab body for a tool call / resource read / prompt get: estimates
// the response's token cost and hands it to the shared footprint visualization.
export function ResponseFootprintTab({ response }: ResponseFootprintTabProps): React.JSX.Element {
  const estimate = useMemo(() => estimateResponseTokens(response), [response])

  return (
    <TokenFootprintView
      title="Response footprint"
      subjectNoun="response"
      tokens={estimate.tokens}
      characters={estimate.characters}
      rawBytes={estimate.rawBytes}
      binaryBlocks={estimate.binaryBlocks}
    />
  )
}
