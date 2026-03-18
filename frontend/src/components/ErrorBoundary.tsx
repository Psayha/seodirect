import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  label?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', this.props.label ?? '', error, info.componentStack)
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="p-6 rounded-lg bg-red-50 border border-red-200 text-red-700">
          <p className="font-medium">Что-то пошло не так{this.props.label ? ` (${this.props.label})` : ''}</p>
          <p className="text-sm mt-1 text-red-500">{this.state.error?.message}</p>
          <button
            className="mt-3 text-sm underline text-red-600 hover:text-red-800"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Попробовать снова
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
