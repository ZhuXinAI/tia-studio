import { createContext, useContext } from 'react'

type AppV2TitlebarContextValue = {
  setTitle: (title: string | null) => void
}

export const AppV2TitlebarContext = createContext<AppV2TitlebarContextValue>({
  setTitle: () => undefined
})

export function useAppV2Titlebar(): AppV2TitlebarContextValue {
  return useContext(AppV2TitlebarContext)
}
