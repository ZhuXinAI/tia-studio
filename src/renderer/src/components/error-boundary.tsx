import { Component, type ReactNode } from 'react'
import { Button } from './ui/button'
import { Card } from './ui/card'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('Error caught by boundary:', error, errorInfo)
  }

  handleRefresh = (): void => {
    window.location.reload()
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-full items-center justify-center p-4">
          <Card className="max-w-lg p-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold">Something went wrong</h2>
                <p className="text-muted-foreground">
                  The application encountered an unexpected error. You can try refreshing the app or
                  resetting the current view.
                </p>
              </div>

              {this.state.error && (
                <details className="rounded-md bg-muted p-3 text-sm">
                  <summary className="cursor-pointer font-medium">Error details</summary>
                  <pre className="mt-2 overflow-auto text-xs">
                    {this.state.error.message}
                    {'\n\n'}
                    {this.state.error.stack}
                  </pre>
                </details>
              )}

              <div className="flex gap-2">
                <Button onClick={this.handleRefresh} className="flex-1">
                  Refresh App
                </Button>
                <Button onClick={this.handleReset} variant="outline" className="flex-1">
                  Try Again
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
