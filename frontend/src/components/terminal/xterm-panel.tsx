"use client";

import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";

import { API_BASE_URL } from "@/lib/config";

type XtermPanelProps = {
  deviceName?: string | null;
  deviceId?: string | null;
};

export function XtermPanel({ deviceName, deviceId }: XtermPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const terminal = new Terminal({
      fontFamily: "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 13,
      cursorBlink: true,
      convertEol: true,
      scrollback: 2000,
      theme: {
        background: "#0b0f14",
        foreground: "#e5e7eb",
        cursor: "#38bdf8",
        selectionBackground: "#334155",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    fitAddon.fit();

    const label =
      deviceName?.trim() || (deviceId ? `device ${deviceId.slice(0, 8)}` : "device");
    terminal.writeln(`Connected to ${label}.`);
    terminal.writeln("Connecting to mock WebSocket UART stream...");

    const wsBaseUrl = API_BASE_URL.replace(/^http/i, "ws");
    const wsDeviceId = deviceId?.trim() || "mock-device";
    const socket = new WebSocket(`${wsBaseUrl}/api/v1/ws/uart/${encodeURIComponent(wsDeviceId)}`);

    socket.addEventListener("open", () => {
      terminal.writeln("WebSocket connected.");
    });

    socket.addEventListener("message", (event) => {
      terminal.write(String(event.data));
    });

    socket.addEventListener("close", () => {
      terminal.writeln("\r\n[WebSocket disconnected]");
    });

    socket.addEventListener("error", () => {
      terminal.writeln("\r\n[WebSocket error]");
    });

    const inputDisposable = terminal.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    });

    const handleResize = () => fitAddon.fit();
    window.addEventListener("resize", handleResize);

    const observer = new ResizeObserver(() => fitAddon.fit());
    observer.observe(container);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
      inputDisposable.dispose();
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
      terminal.dispose();
    };
  }, [deviceName, deviceId]);

  return (
    <div className="rounded-2xl border border-slate-900/10 bg-slate-950/95 p-4 shadow-lg">
      <div ref={containerRef} className="h-[360px] w-full" />
      <p className="mt-3 text-xs text-slate-400">
        Mock WebSocket stream is enabled. Incoming UART-like lines and terminal input echo are supported.
      </p>
    </div>
  );
}
