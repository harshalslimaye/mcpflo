import { useEffect } from 'react'
import { PrimarySidebar } from '../components/sidebar/PrimarySidebar'
import { SecondarySidebar } from '../components/sidebar/SecondarySidebar'
import { ContentArea } from '../components/canvas/ContentArea'
import { useServerStore } from '../stores/serverStore'

function App(): React.JSX.Element {
  const hydrate = useServerStore((s) => s.hydrate)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  return (
    <div className="flex flex-row w-full h-full overflow-hidden bg-bg-primary">
      <PrimarySidebar />
      <SecondarySidebar />
      <ContentArea />
    </div>
  )
}

export default App
