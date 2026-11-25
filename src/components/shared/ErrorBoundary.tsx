'use client';

import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface Props {
  children: React.ReactNode;
  /** Shown in the fallback so the user knows which panel died. */
  name?: string;
  fallback?: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Keeps one broken panel from taking down the whole editor.
 *
 * Canvas and media code is the likeliest thing to throw here — a tainted
 * canvas, a codec the browser refuses, a null WebGL context — and none of that
 * should lose the user's other work.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Swap for your telemetry sink when you add one.
    console.error(`[${this.props.name ?? 'ErrorBoundary'}]`, error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <AlertTriangle className="h-7 w-7 text-destructive" />
        <div>
          <p className="text-sm font-medium">
            {this.props.name ? `${this.props.name} crashed` : 'Something broke'}
          </p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">{error.message}</p>
        </div>
        <Button size="sm" variant="outline" onClick={this.reset}>
          <RotateCcw />
          Try again
        </Button>
      </div>
    );
  }
}
