import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { useServerStore } from '../../stores/serverStore'

interface DeleteServerModalProps {
  serverId: string
  serverName: string
  onClose: () => void
}

export function DeleteServerModal({
  serverId,
  serverName,
  onClose
}: DeleteServerModalProps): React.JSX.Element {
  const removeServer = useServerStore((s) => s.removeServer)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete(): Promise<void> {
    setDeleting(true)
    try {
      await removeServer(serverId)
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Modal title="Delete Server" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-primary">
          Delete <span className="font-medium">{serverName}</span>? This removes its configuration
          and cached capabilities. This can&rsquo;t be undone.
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded text-sm text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="px-3 py-1.5 rounded text-sm bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
