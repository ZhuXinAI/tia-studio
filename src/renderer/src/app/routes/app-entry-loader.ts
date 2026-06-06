import { redirect } from 'react-router-dom'

export function appEntryLoader() {
  return redirect('/chat')
}
