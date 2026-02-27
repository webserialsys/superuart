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
  created_at?: string;
  locked_at?: string | null;
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
    let isDisposed = false;
    let initialFitFrame: number | null = null;
    let socketListenerCleanup: (() => void) | null = null;
    const safeWriteln = (value: string) => {
      if (isDisposed) {
        return;
      }
      try {
        terminal.writeln(value);
      } catch {
        // xterm can throw while disposing.
      }
    };
    const safeWrite = (value: string) => {
      if (isDisposed) {
        return;
      }
      try {
        terminal.write(value);
      } catch {
        // xterm can throw while disposing.
      }
    };
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    const safeFit = () => {
      if (isDisposed) {
        return;
      }
      try {
        fitAddon.fit();
      } catch {
        // xterm can throw while dimensions are not ready or after dispose.
      }
    };
    if (typeof window.requestAnimationFrame === "function") {
      initialFitFrame = window.requestAnimationFrame(() => safeFit());
    } else {
      safeFit();
    }
    terminalRef.current = terminal;
    sessionRef.current = null;
    socketRef.current = null;

    const label =
      deviceName?.trim() || (deviceId ? `device ${deviceId.slice(0, 8)}` : "device");
    const selectedBaudrate = normalizeBaudrate(baudrate);
    safeWriteln(`Connected to ${label}.`);
    safeWriteln(`UART baudrate set to ${selectedBaudrate} bps.`);
    safeWriteln("Connecting to mock WebSocket UART stream...");

    const controller = new AbortController();
    const cleanupSocketListeners = () => {
      if (socketListenerCleanup) {
        socketListenerCleanup();
        socketListenerCleanup = null;
      }
    };

    const openWebSocket = (connectionId: string, deviceUuid: string) => {
      if (isDisposed) {
        return;
      }
      cleanupSocketListeners();
      const wsBaseUrl = API_BASE_URL.replace(/^http/i, "ws");
      const wsParams = new URLSearchParams({
        connection_id: connectionId,
        baudrate: selectedBaudrate,
      });
      const wsUrl = `${wsBaseUrl}/api/v1/ws/uart/${encodeURIComponent(deviceUuid)}?${wsParams.toString()}`;
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      const handleOpen = () => {
        safeWriteln("WebSocket connected.");
      };

      const handleMessage = (event: MessageEvent) => {
        safeWrite(String(event.data));
      };

      const handleClose = (event: CloseEvent) => {
        const reason = event.reason ? `: ${event.reason}` : "";
        safeWriteln(`\r\n[WebSocket disconnected${reason}]`);
      };

      const handleError = () => {
        safeWriteln("\r\n[WebSocket error]");
      };

      socket.addEventListener("open", handleOpen);
      socket.addEventListener("message", handleMessage);
      socket.addEventListener("close", handleClose);
      socket.addEventListener("error", handleError);
      socketListenerCleanup = () => {
        socket.removeEventListener("open", handleOpen);
        socket.removeEventListener("message", handleMessage);
        socket.removeEventListener("close", handleClose);
        socket.removeEventListener("error", handleError);
      };
    };

    const requestSession = async () => {
      if (!token || !user?.uuid) {
        safeWriteln("\r\n[Login required to open a session]");
        return;
      }

      let existingActiveSession: SessionRead | null = null;
      try {
        const sessions = await apiRequest<{ data: SessionRead[] }>("/api/v1/sessions?page=1&items_per_page=100", {
          method: "GET",
          token,
          signal: controller.signal,
        });
        const activeSessions = (sessions.data ?? []).filter((session) => session.status === "ACTIVE");
        if (activeSessions.length > 0) {
          const sortedByMostRecent = [...activeSessions].sort((left, right) => {
            const leftTime = Date.parse(left.locked_at ?? left.created_at ?? "");
            const rightTime = Date.parse(right.locked_at ?? right.created_at ?? "");
            const safeLeft = Number.isNaN(leftTime) ? 0 : leftTime;
            const safeRight = Number.isNaN(rightTime) ? 0 : rightTime;
            return safeRight - safeLeft;
          });
          existingActiveSession =
            (deviceId ? sortedByMostRecent.find((session) => session.device_uuid === deviceId) : null) ??
            sortedByMostRecent[0];
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load active sessions";
        safeWriteln(`\r\n[${message}]`);
      }
      if (isDisposed) {
        return;
      }

      if (existingActiveSession) {
        sessionRef.current = existingActiveSession;
        safeWriteln(`Using active session ${existingActiveSession.uuid}. Opening stream...`);
        openWebSocket(existingActiveSession.connection_id, existingActiveSession.device_uuid);
        return;
      }

      if (!deviceId?.trim()) {
        safeWriteln("\r\n[Select a device to start a session]");
        return;
      }

      safeWriteln(`Requesting session lock at ${selectedBaudrate} bps...`);
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
        safeWriteln(`\r\n[${message}]`);
        return;
      }
      if (isDisposed) {
        return;
      }

      if (!sessionRef.current) {
        safeWriteln("\r\n[Session creation failed]");
        return;
      }

      safeWriteln(`Session ${sessionRef.current.uuid} active. Opening stream...`);
      openWebSocket(sessionRef.current.connection_id, sessionRef.current.device_uuid);
    };

    void requestSession();

    const inputDisposable = terminal.onData((data) => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(data);
      }
    });

    const handleResize = () => safeFit();
    window.addEventListener("resize", handleResize);

    const observer = new ResizeObserver(() => safeFit());
    observer.observe(container);

    return () => {
      isDisposed = true;
      controller.abort();
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
      cleanupSocketListeners();
      if (initialFitFrame !== null && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(initialFitFrame);
      }
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
