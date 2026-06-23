import { HistoryRail } from './HistoryRail'
import { ActivityList } from './ActivityList'
import { useActivityLog } from './useActivityLog'

// The history rail shown when no tool/resource/prompt is selected. There's no
// entity in context, so it has no "This …" tab — just the global "All" log, so
// history is visible (and the connection/listing events are reachable) before
// the user opens anything. Clicking a call row navigates to its entity.
export function GlobalActivityRail(): React.JSX.Element {
  const { events, navigateTo, clearAll } = useActivityLog()

  return (
    <HistoryRail count={events.length} onClear={clearAll}>
      <ActivityList events={events} emptyLabel="No activity yet." onSelect={navigateTo} />
    </HistoryRail>
  )
}
