import { Component } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Button from "./Button";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoDashboard = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/dashboard";
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          resetError: this.handleReset,
        });
      }

      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-4 py-12 text-ink">
          <div className="w-full max-w-md rounded-2xl border border-border-warm bg-surface p-8 shadow-xs text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 border border-rose-100">
              <AlertTriangle className="h-7 w-7" aria-hidden="true" />
            </div>

            <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">
              Something went wrong
            </h1>
            <p className="mt-2 text-sm text-ink-muted leading-relaxed">
              An unexpected error occurred while displaying this page. You can try refreshing the view or returning to your dashboard.
            </p>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                variant="primary"
                onClick={this.handleReload}
                className="w-full sm:w-auto"
              >
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                Reload Page
              </Button>
              <Button
                variant="outline"
                onClick={this.handleGoDashboard}
                className="w-full sm:w-auto"
              >
                <Home className="mr-2 h-4 w-4 text-stone-500" aria-hidden="true" />
                Go to Dashboard
              </Button>
            </div>

            {import.meta.env?.DEV && this.state.error && (
              <details className="mt-6 text-left border-t border-border-warm pt-4">
                <summary className="cursor-pointer text-xs font-medium text-stone-500 hover:text-stone-700">
                  Developer details
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-stone-100 p-2 text-xs text-rose-800 font-mono">
                  {this.state.error.toString()}
                  {this.state.error.stack ? `\n${this.state.error.stack}` : ""}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
