import type { AnchorHTMLAttributes } from "react";
import React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TerminalPage from "@/app/(app)/terminal/page";

const { useAuthMock, searchParamsGetMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  searchParamsGetMock: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: searchParamsGetMock }),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/components/terminal/xterm-panel", () => ({
  XtermPanel: ({
    deviceName,
    deviceId,
    baudrate,
  }: {
    deviceName?: string | null;
    deviceId?: string | null;
    baudrate?: string | null;
  }) => (
    <div data-testid="xterm-stub">
      {`${deviceName ?? ""}|${deviceId ?? ""}|${baudrate ?? ""}`}
    </div>
  ),
}));

describe("TerminalPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({
      user: {
        uuid: "teacher-1",
        email: "teacher@example.com",
        full_name: "Teacher",
        role: "teacher",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: null,
      },
    });
    searchParamsGetMock.mockImplementation(() => null);
  });

  it("renders selected session labels and passes params to terminal panel", () => {
    searchParamsGetMock.mockImplementation((key: string) => {
      if (key === "name") return "Lab board";
      if (key === "device") return "device-uuid-12345678";
      if (key === "baudrate") return "57600";
      return null;
    });

    render(<TerminalPage />);

    expect(screen.getByText(/Teacher mode is active/i)).toBeInTheDocument();
    expect(screen.getByText(/Ready for Lab board\./i)).toBeInTheDocument();
    expect(screen.getByText(/Connected to Lab board\./i)).toBeInTheDocument();
    expect(screen.getByTestId("xterm-stub")).toHaveTextContent("Lab board|device-uuid-12345678|57600");
    expect(screen.getByLabelText(/baudrate/i)).toHaveValue("57600");
  });

  it("falls back to default mode and default baudrate", () => {
    useAuthMock.mockReturnValue({
      user: {
        uuid: "student-1",
        email: "student@example.com",
        full_name: "Student",
        role: "student",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: null,
      },
    });

    render(<TerminalPage />);

    expect(screen.getByText(/Student mode is active/i)).toBeInTheDocument();
    expect(screen.getByText(/No active device selected yet\./i)).toBeInTheDocument();
    expect(screen.getByTestId("xterm-stub")).toHaveTextContent("||115200");
    expect(screen.getByLabelText(/baudrate/i)).toHaveValue("115200");
  });

  it("updates baudrate passed to terminal when user changes select", async () => {
    const user = userEvent.setup();
    searchParamsGetMock.mockImplementation((key: string) => {
      if (key === "baudrate") return "115200";
      if (key === "device") return "dev-1";
      return null;
    });

    render(<TerminalPage />);
    await user.selectOptions(screen.getByLabelText(/baudrate/i), "9600");

    expect(screen.getByTestId("xterm-stub")).toHaveTextContent("|dev-1|9600");
  });
});
