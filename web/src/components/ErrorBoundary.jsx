import { Component } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * Without this, any error thrown while rendering unmounts the entire tree and
 * leaves a blank white page whose only cure is a reload — which tells you
 * nothing about what broke. This keeps the failure on screen and readable.
 */
export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the component stack — it's the part that says *which* screen died.
    console.error('[sonora] render error', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="glass glass-sheen w-full max-w-[560px] rounded-panel p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-[#ff9f0a]/18 text-[#ff9f0a]">
              <AlertTriangle size={19} />
            </span>
            <div>
              <h1 className="text-[17px] font-semibold tracking-tight">Something broke on this screen</h1>
              <p className="text-[12.5px] text-white/45">The rest of the app is fine — this view stopped.</p>
            </div>
          </div>

          <pre className="mask-fade-y max-h-[220px] overflow-auto rounded-card bg-black/40 p-3 text-[11.5px] leading-relaxed text-white/60">
            {String(error?.stack || error?.message || error)}
          </pre>

          <div className="mt-5 flex gap-2">
            <button onClick={() => this.setState({ error: null })} className="btn btn-glass flex-1">
              <RotateCcw size={14} />
              Try again
            </button>
            <button
              onClick={() => {
                window.location.hash = '/';
                window.location.reload();
              }}
              className="btn btn-primary flex-1"
            >
              Back to rooms
            </button>
          </div>
        </div>
      </div>
    );
  }
}
