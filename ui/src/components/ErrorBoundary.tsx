// A crash in any panel must show a readable error card, never a silent black
// void (the symptom users actually see when a React subtree dies).
import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ name: string; children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(err: unknown) {
    return { error: String((err as Error)?.message ?? err) };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="crash">
          <strong>{this.props.name} crashed</strong>
          <pre>{this.state.error}</pre>
          <button onClick={() => this.setState({ error: null })}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}
