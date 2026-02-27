import type { AnchorHTMLAttributes } from "react";
import React from "react";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/layout/app-shell";

const { replaceMock, pathnameMock, logoutMock, useAuthMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  pathnameMock: vi.fn(),
  logoutMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => pathnameMock(),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => useAuthMock(),
}));

describe("AppShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathnameMock.mockReturnValue("/dashboard");
    useAuthMock.mockReturnValue({
      user: {
        uuid: "teacher-1",
        full_name: "Teacher User",
        email: "teacher@example.com",
        role: "teacher",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: null,
      },
      logout: logoutMock,
    });
  });

  it("shows full teacher navigation", () => {
    render(
      <AppShell>
        <div>Page body</div>
      </AppShell>,
    );

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Hosts")).toBeInTheDocument();
    expect(screen.getByText("Students")).toBeInTheDocument();
    expect(screen.getByText("Devices")).toBeInTheDocument();
    expect(screen.getByText("Terminal")).toBeInTheDocument();
    expect(screen.getByText("Page body")).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("limits student navigation and redirects away from forbidden routes", async () => {
    useAuthMock.mockReturnValue({
      user: {
        uuid: "student-1",
        full_name: "Student User",
        email: "student@example.com",
        role: "student",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: null,
      },
      logout: logoutMock,
    });
    pathnameMock.mockReturnValue("/dashboard");

    render(
      <AppShell>
        <div>Page body</div>
      </AppShell>,
    );

    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.queryByText("Hosts")).not.toBeInTheDocument();
    expect(screen.queryByText("Students")).not.toBeInTheDocument();
    expect(screen.getByText("Devices")).toBeInTheDocument();
    expect(screen.getByText("Terminal")).toBeInTheDocument();

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/devices");
    });
  });

  it("does not redirect students on allowed devices/terminal routes", async () => {
    useAuthMock.mockReturnValue({
      user: {
        uuid: "student-1",
        full_name: "Student User",
        email: "student@example.com",
        role: "student",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: null,
      },
      logout: logoutMock,
    });
    pathnameMock.mockReturnValue("/terminal/session-1");

    render(
      <AppShell>
        <div>Page body</div>
      </AppShell>,
    );

    await waitFor(() => {
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });

  it("calls logout action from sidebar button", async () => {
    const user = userEvent.setup();
    render(
      <AppShell>
        <div>Page body</div>
      </AppShell>,
    );

    await user.click(screen.getByRole("button", { name: /logout/i }));
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });
});
