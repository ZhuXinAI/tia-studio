import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes - data is considered fresh for this duration
      gcTime: 10 * 60 * 1000, // 10 minutes - unused data is garbage collected after this
      retry: 1, // Retry failed requests once
      refetchOnWindowFocus: true, // Refetch when window regains focus
      refetchOnReconnect: true // Refetch when network reconnects
    },
    mutations: {
      retry: 0 // Don't retry mutations by default
    }
  }
})
