export type UpdateState =
  | 'idle'
  | 'checking'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateStatus {
  state: UpdateState
  currentVersion: string
  availableVersion?: string
  percent?: number
  message?: string
}
