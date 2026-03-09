import { useTranslation } from '../i18n/use-app-translation'
import { useRouteError, isRouteErrorResponse } from 'react-router-dom'
import { Button } from './ui/button'
import { Card } from './ui/card'

export function RouteError(): React.JSX.Element {
  const { t } = useTranslation()
  const error = useRouteError()

  let errorMessage = 'An unexpected error occurred'
  let errorDetails: string | undefined

  if (isRouteErrorResponse(error)) {
    errorMessage = error.statusText || errorMessage
    errorDetails = error.data?.message
  } else if (error instanceof Error) {
    errorMessage = error.message
    errorDetails = error.stack
  }

  const handleRefresh = (): void => {
    window.location.reload()
  }

  const handleGoHome = (): void => {
    window.location.hash = '#/chat'
  }

  return (
    <div className="flex h-screen w-full items-center justify-center p-4">
      <Card className="max-w-lg p-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">{t('common.routeError.title')}</h2>
            <p className="text-muted-foreground">{errorMessage}</p>
          </div>

          {errorDetails && (
            <details className="rounded-md bg-muted p-3 text-sm">
              <summary className="cursor-pointer font-medium">
                {t('common.routeError.details')}
              </summary>
              <pre className="mt-2 overflow-auto text-xs">{errorDetails}</pre>
            </details>
          )}

          <div className="flex gap-2">
            <Button onClick={handleRefresh} className="flex-1">
              {t('common.routeError.refreshApp')}
            </Button>
            <Button onClick={handleGoHome} variant="outline" className="flex-1">
              {t('common.routeError.goHome')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
