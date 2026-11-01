import { Component, ReactNode } from "react";

interface Props { children: ReactNode; name?: string; }
interface State { crashed: boolean; error: string; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false, error: "" };
  static getDerivedStateFromError(e: Error): State {
    return { crashed: true, error: e.message };
  }
  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center gap-3">
        <div className="text-5xl">⚠️</div>
        <div className="text-[#a855f7] font-bold text-lg">{this.props.name ?? "Tab"} offline</div>
        <div className="text-[#9d8ec4] text-sm max-w-xs">{this.state.error}</div>
        <button onClick={() => this.setState({ crashed: false, error: "" })}
          className="bg-[#a855f7] text-white px-5 py-2 rounded-xl text-sm font-medium">
          Neu laden
        </button>
      </div>
    );
  }
}
