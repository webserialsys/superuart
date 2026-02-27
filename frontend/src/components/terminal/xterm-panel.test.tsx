import React from "react";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { XtermPanel } from "@/components/terminal/xterm-panel";

type Listener = (event?: unknown) => void;

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.OPEN;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
  });
  private listeners = new Map<string, Listener[]>();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, callback: Listener) {
    const current = this.listeners.get(type) ?? [];
    this.listeners.set(type, [...current, callback]);
  }

  removeEventListener(type: string, callback: Listener) {
    const current = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      current.filter((listener) => listener !== callback),
    );
  }

  emit(type: string, event?: unknown) {
    const current = this.listeners.get(type) ?? [];
    current.forEach((listener) => listener(event));
  }
}

const {
  useAuthMock,
  apiRequestMock,
  terminalWritelnMock,
  terminalWriteMock,
  terminalOnDataMock,
  terminalDisposeMock,
  fitAddonFitMock,
  fitAddonLoadMock,
  fitAddonOpenMock,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  apiRequestMock: vi.fn(),
  terminalWritelnMock: vi.fn(),
  terminalWriteMock: vi.fn(),
  terminalOnDataMock: vi.fn(),
  terminalDisposeMock: vi.fn(),
  fitAddonFitMock: vi.fn(),
  fitAddonLoadMock: vi.fn(),
  fitAddonOpenMock: vi.fn(),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/lib/api/client", () => ({
  apiRequest: apiRequestMock,
}));

vi.mock("xterm", () => ({
  Terminal: class {
    loadAddon = fitAddonLoadMock;
    open = fitAddonOpenMock;
    writeln = terminalWritelnMock;
    write = terminalWriteMock;
    onData = terminalOnDataMock.mockImplementation(() => ({ dispose: vi.fn() }));
    dispose = terminalDisposeMock;
  },
}));

vi.mock("xterm-addon-fit", () => ({
  FitAddon: class {
    fit = fitAddonFitMock;
  },
}));

describe("XtermPanel", () => {
  const originalWebSocket = global.WebSocket;
  const originalResizeObserver = global.ResizeObserver;

  beforeAll(() => {
    global.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    global.ResizeObserver = class {
      observe() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    } as unknown as typeof ResizeObserver;
  });

  afterAll(() => {
    global.WebSocket = originalWebSocket;
    global.ResizeObserver = originalResizeObserver;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    MockWebSocket.instances = [];
    apiRequestMock.mockResolvedValue({ data: [] });
    useAuthMock.mockReturnValue({
      token: "token-1",
      user: {
        uuid: "user-1",
      },
    });
  });

  it("shows prompt to select device when device id is missing", async () => {
    render(<XtermPanel deviceName={null} deviceId={null} baudrate={null} />);

    await waitFor(() => {
      expect(terminalWritelnMock).toHaveBeenCalledWith("\r\n[Select a device to start a session]");
    });
    expect(apiRequestMock).toHaveBeenCalledWith("/api/v1/sessions?page=1&items_per_page=100", {
      method: "GET",
      token: "token-1",
      signal: expect.any(AbortSignal),
    });
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it("shows login prompt when token is missing", async () => {
    useAuthMock.mockReturnValue({
      token: null,
      user: null,
    });

    render(<XtermPanel deviceName="Board A" deviceId="device-a" baudrate="9600" />);

    await waitFor(() => {
      expect(terminalWritelnMock).toHaveBeenCalledWith("\r\n[Login required to open a session]");
    });
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("opens and closes uart session with websocket", async () => {
    const user = userEvent.setup();
    apiRequestMock.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === "/api/v1/sessions?page=1&items_per_page=100" && options?.method === "GET") {
        return Promise.resolve({ data: [] });
      }
      if (path === "/api/v1/session" && options?.method === "POST") {
        return Promise.resolve({
          uuid: "session-1",
          connection_id: "conn-1",
          device_uuid: "device-a",
          status: "ACTIVE",
        });
      }
      if (path === "/api/v1/session/session-1" && options?.method === "PUT") {
        return Promise.resolve({});
      }
      return Promise.reject(new Error(`unexpected call: ${path}`));
    });

    render(<XtermPanel deviceName="Board A" deviceId="device-a" baudrate="9600" />);

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith("/api/v1/session", {
        method: "POST",
        token: "token-1",
        signal: expect.any(AbortSignal),
        body: {
          user_uuid: "user-1",
          device_uuid: "device-a",
        },
      });
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    const socket = MockWebSocket.instances[0];
    expect(socket.url).toContain("/api/v1/ws/uart/device-a?");
    expect(socket.url).toContain("connection_id=conn-1");
    expect(socket.url).toContain("baudrate=9600");

    socket.emit("message", { data: "uart line" });
    expect(terminalWriteMock).toHaveBeenCalledWith("uart line");

    await user.click(screen.getByRole("button", { name: /end session/i }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith("/api/v1/session/session-1", {
        method: "PUT",
        token: "token-1",
        body: { status: "CLOSED" },
      });
    });
    expect(socket.close).toHaveBeenCalled();
  });

  it("reuses existing active session for current user", async () => {
    apiRequestMock.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === "/api/v1/sessions?page=1&items_per_page=100" && options?.method === "GET") {
        return Promise.resolve({
          data: [
            {
              uuid: "session-existing",
              connection_id: "conn-existing",
              device_uuid: "device-a",
              status: "ACTIVE",
              locked_at: "2026-02-27T10:00:00Z",
            },
          ],
        });
      }
      return Promise.reject(new Error(`unexpected call: ${path}`));
    });

    render(<XtermPanel deviceName="Board A" deviceId="device-a" baudrate="9600" />);

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    expect(apiRequestMock).not.toHaveBeenCalledWith(
      "/api/v1/session",
      expect.objectContaining({ method: "POST" }),
    );
    expect(terminalWritelnMock).toHaveBeenCalledWith("Using active session session-existing. Opening stream...");
    const socket = MockWebSocket.instances[0];
    expect(socket.url).toContain("connection_id=conn-existing");
  });

  it("removes socket listeners on unmount", async () => {
    apiRequestMock.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === "/api/v1/sessions?page=1&items_per_page=100" && options?.method === "GET") {
        return Promise.resolve({ data: [] });
      }
      if (path === "/api/v1/session" && options?.method === "POST") {
        return Promise.resolve({
          uuid: "session-1",
          connection_id: "conn-1",
          device_uuid: "device-a",
          status: "ACTIVE",
        });
      }
      return Promise.reject(new Error(`unexpected call: ${path}`));
    });

    const { unmount } = render(<XtermPanel deviceName="Board A" deviceId="device-a" baudrate="9600" />);

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    const socket = MockWebSocket.instances[0];
    const callsBeforeUnmount = terminalWritelnMock.mock.calls.length;
    unmount();

    socket.emit("close", { reason: "late-close" });
    expect(terminalWritelnMock.mock.calls.length).toBe(callsBeforeUnmount);
  });
});
