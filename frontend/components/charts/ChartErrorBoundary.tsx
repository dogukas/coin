"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Bir grafik bileşeni çökerse tüm sayfa yerine sadece grafik alanı hata gösterir.
export default class ChartErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ChartErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full min-h-[400px] flex flex-col items-center justify-center gap-3 text-center">
          <span className="text-sm text-gray-400">Grafik yüklenemedi.</span>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white font-mono"
          >
            Yeniden dene
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
