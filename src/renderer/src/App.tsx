import { PrimarySidebar } from '../components/sidebar/PrimarySidebar'
import { SecondarySidebar } from '../components/sidebar/SecondarySidebar'
import { ContentArea } from '../components/canvas/ContentArea'

function App(): React.JSX.Element {
  return (
    <div className="flex flex-row w-full h-full overflow-hidden bg-bg-primary">
      <PrimarySidebar />
      <SecondarySidebar />
      <ContentArea />
    </div>
  )
}

export default App
