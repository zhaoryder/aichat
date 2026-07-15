import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
  fallback?: (error: Error, reset: () => void) => ReactNode
}

interface State {
  error: Error | null
}

/** 简单的 ErrorBoundary，捕获子组件渲染异常并显示错误信息（而非白屏） */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset)
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-lg font-semibold text-red-600 dark:text-red-400">页面出错了</p>
          <p className="max-w-md text-sm text-gray-600 dark:text-gray-400">
            {this.state.error.message || '未知错误'}
          </p>
          <button
            type="button"
            onClick={this.reset}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform hover:scale-105"
          >
            重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
