import { useEffect } from 'react'
import { SecondarySidebar } from '../components/sidebar/SecondarySidebar'
import { ContentArea } from '../components/canvas/ContentArea'
import { BottomBar } from '../components/layout/BottomBar'
import { ElicitationHost } from '../components/elicitation/ElicitationHost'
import { SamplingHost } from '../components/sampling/SamplingHost'
import { useServerStore } from '../stores/serverStore'

function App(): React.JSX.Element {
  const hydrate = useServerStore((s) => s.hydrate)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  return (
    <div className="flex flex-col w-full h-full overflow-hidden bg-bg-primary">
      <div className="flex flex-row flex-1 min-h-0 overflow-hidden">
        <SecondarySidebar />
        <ContentArea />
      </div>
      <BottomBar />
      <ElicitationHost />
      <SamplingHost />
    </div>
  )
}

export default App
