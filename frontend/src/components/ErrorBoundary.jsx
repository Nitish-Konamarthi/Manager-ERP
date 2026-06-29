import React from 'react'
import { Alert, Button } from 'antd'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert
          message="Something went wrong"
          description={this.state.error?.message || 'An unexpected error occurred'}
          type="error"
          showIcon
          action={
            <Button size="small" onClick={() => window.location.reload()}>
              Reload Page
            </Button>
          }
        />
      )
    }
    return this.props.children
  }
}
