"use client";

import { Component, type ReactNode, useEffect, useSyncExternalStore } from "react";
import { errorText, reportError } from "@/lib/clientLog";
import { hasWebGL } from "@/lib/webgl";

class Boundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  componentDidCatch(error: unknown) {
    reportError({ kind: "boundary", ...errorText(error), url: undefined });
  }
  render() {
    if (this.state.error)
      return (
        <Notice
          title="Die 3D-Ansicht konnte nicht angezeigt werden"
          text="Der Grundriss und Ihre Daten sind davon nicht betroffen."
          action={() => this.setState({ error: null })}
        />
      );
    return this.props.children;
  }
}

function Notice({ title, text, action }: { title: string; text: string; action?: () => void }) {
  return (
    <div className="flex h-full items-center justify-center bg-paper p-6 text-center" data-testid="no-3d">
      <div className="max-w-sm">
        <div className="font-semibold">{title}</div>
        <p className="mt-1 text-sm text-muted">{text}</p>
        {action && (
          <button type="button" onClick={action} className="mt-3 rounded-md border border-line px-3 py-1.5 text-sm">
            Erneut versuchen
          </button>
        )}
      </div>
    </div>
  );
}

const subscribe = () => () => {};

/** 3D only with WebGL, and a crash in it never takes the editor down. */
export function Safe3D({ children }: { children: ReactNode }) {
  const webgl = useSyncExternalStore(subscribe, hasWebGL, () => true);
  useEffect(() => {
    if (!webgl) reportError({ kind: "webgl", message: "WebGL nicht verfügbar" });
  }, [webgl]);
  if (!webgl) {
    return (
      <Notice
        title="3D ist in diesem Browser nicht verfügbar"
        text="WebGL ist ausgeschaltet oder wird nicht unterstützt. Aktivieren Sie die Hardwarebeschleunigung in den Browser-Einstellungen oder nutzen Sie einen aktuellen Chrome, Edge, Firefox oder Safari. Der 2D-Grundriss funktioniert weiterhin."
      />
    );
  }
  return <Boundary>{children}</Boundary>;
}
