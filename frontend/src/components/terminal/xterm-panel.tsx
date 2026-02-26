"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/api/client";
import { API_BASE_URL } from "@/lib/config";
import { normalizeBaudrate } from "@/lib/uart";

type XtermPanelProps = {
  deviceName?: string | null;
  deviceId?: string | null;
  baudrate?: string | null;
};

type SessionRead = {
  uuid: string;
  connection_id: string;
  device_uuid: string;
  status: "ACTIVE" | "CLOSED" | "EXPIRED";
};

export function XtermPanel({ deviceName, deviceId, baudrate }: XtermPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef<SessionRead | null>(null);
  const { token, user } = useAuth();
  const [isEndingSession, setIsEndingSession] = useState(false);

  const endSession = useCallback(async () => {
    if (!token || !sessionRef.current) {
      return;
    }

    const currentSession = sessionRef.current;
    setIsEndingSession(true);
    try {
      await apiRequest(`/api/v1/session/${currentSession.uuid}`, {
        method: "PUT",
        token,
        body: { status: "CLOSED" },
      });
      terminalRef.current?.writeln("\r\n[Session closed by user]");
      if (socketRef.current) {
        socketRef.current.close();
      }
      sessionRef.current = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to close session";
      terminalRef.current?.writeln(`\r\n[${message}]`);
    } finally {
      setIsEndingSession(false);
    }
  }, [token]);

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
    terminalRef.current = terminal;
    sessionRef.current = null;
    socketRef.current = null;

    const label =
      deviceName?.trim() || (deviceId ? `device ${deviceId.slice(0, 8)}` : "device");
    const selectedBaudrate = normalizeBaudrate(baudrate);
    terminal.writeln(`Connected to ${label}.`);
    terminal.writeln(`UART baudrate set to ${selectedBaudrate} bps.`);
    terminal.writeln("Connecting to mock WebSocket UART stream...");

    const controller = new AbortController();

    const openWebSocket = (connectionId: string, deviceUuid: string) => {
      const wsBaseUrl = API_BASE_URL.replace(/^http/i, "ws");
      const wsParams = new URLSearchParams({
        connection_id: connectionId,
        baudrate: selectedBaudrate,
      });
      const wsUrl = `${wsBaseUrl}/api/v1/ws/uart/${encodeURIComponent(deviceUuid)}?${wsParams.toString()}`;
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        terminal.writeln("WebSocket connected.");
      });

      socket.addEventListener("message", (event) => {
        terminal.write(String(event.data));
      });

      socket.addEventListener("close", (event) => {
        const reason = event.reason ? `: ${event.reason}` : "";
        terminal.writeln(`\r\n[WebSocket disconnected${reason}]`);
      });

      socket.addEventListener("error", () => {
        terminal.writeln("\r\n[WebSocket error]");
      });
    };

    const requestSession = async () => {
      if (!deviceId?.trim()) {
        terminal.writeln("\r\n[Select a device to start a session]");
        return;
      }
      if (!token || !user?.uuid) {
        terminal.writeln("\r\n[Login required to open a session]");
        return;
      }

      terminal.writeln(`Requesting session lock at ${selectedBaudrate} bps...`);
      try {
        sessionRef.current = await apiRequest<SessionRead>("/api/v1/session", {
          method: "POST",
          token,
          signal: controller.signal,
          body: {
            user_uuid: user.uuid,
            device_uuid: deviceId,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to start session";
        terminal.writeln(`\r\n[${message}]`);
        return;
      }

      if (!sessionRef.current) {
        terminal.writeln("\r\n[Session creation failed]");
        return;
      }

      terminal.writeln(`Session ${sessionRef.current.uuid} active. Opening stream...`);
      openWebSocket(sessionRef.current.connection_id, sessionRef.current.device_uuid);
    };

    void requestSession();

    const inputDisposable = terminal.onData((data) => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(data);
      }
    });

    const handleResize = () => fitAddon.fit();
    window.addEventListener("resize", handleResize);

    const observer = new ResizeObserver(() => fitAddon.fit());
    observer.observe(container);

    return () => {
      controller.abort();
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
      inputDisposable.dispose();
      if (
        socketRef.current &&
        (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)
      ) {
        socketRef.current.close();
      }
      socketRef.current = null;
      sessionRef.current = null;
      terminalRef.current = null;
      terminal.dispose();
    };
  }, [baudrate, deviceName, deviceId, token, user?.uuid]);

  return (
    <div className="rounded-2xl border border-slate-900/10 bg-slate-950/95 p-4 shadow-lg">
      <div className="mb-3 flex justify-end">
        <Button type="button" variant="secondary" size="sm" disabled={isEndingSession} onClick={endSession}>
          {isEndingSession ? "Ending..." : "End session"}
        </Button>
      </div>
      <div ref={containerRef} className="h-[360px] w-full" />
      <p className="mt-3 text-xs text-slate-400">
        Mock WebSocket stream is enabled. Incoming UART-like lines and terminal input echo are supported.
      </p>
    </div>
  );
}
