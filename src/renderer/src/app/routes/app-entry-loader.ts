import { redirect } from 'react-router-dom'
import { readStoredAppMode } from '../navigation/app-mode-state'

export function appEntryLoader() {
  const lastMode = readStoredAppMode()

  if (lastMode === 'team') {
    return redirect('/team')
  }

  if (lastMode === 'chat') {
    return redirect('/agents')
  }

  return redirect('/team')
}
