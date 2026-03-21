import { redirect } from 'react-router-dom'
import { readStoredAppMode } from '../navigation/app-mode-state'

export function appEntryLoader() {
  const lastMode = readStoredAppMode()

  return redirect(lastMode === 'team' ? '/team' : '/chat')
}

export function AppEntryRoute(): null {
  return null
}
