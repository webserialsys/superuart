import type { AnchorHTMLAttributes } from "react";
import React from "react";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DashboardPage from "@/app/(app)/dashboard/page";

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => useAuthMock(),
}));

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({
      user: {
        uuid: "user-1",
        email: "user@example.com",
        full_name: "QA User",
        role: "teacher",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: null,
      },
    });
  });

  it("renders session details and teacher quick links", () => {
    render(<DashboardPage />);

    expect(screen.getByText("Hello, QA User")).toBeInTheDocument();
    expect(screen.getByText(/manage uart devices and terminal sessions/i)).toBeInTheDocument();
    expect(screen.getByText("Manage hosts")).toBeInTheDocument();
    expect(screen.getByText("Manage students")).toBeInTheDocument();
    expect(screen.getByText("Device list")).toBeInTheDocument();
    expect(screen.getByText("Terminal")).toBeInTheDocument();
    expect(screen.queryByText(/service status/i)).not.toBeInTheDocument();
  });

  it("hides teacher links for student role", () => {
    useAuthMock.mockReturnValue({
      user: {
        uuid: "user-2",
        email: "student@example.com",
        full_name: "Student User",
        role: "student",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: null,
      },
    });

    render(<DashboardPage />);

    expect(screen.queryByText("Manage hosts")).not.toBeInTheDocument();
    expect(screen.queryByText("Manage students")).not.toBeInTheDocument();
    expect(screen.getByText("Device list")).toBeInTheDocument();
    expect(screen.getByText("Terminal")).toBeInTheDocument();
  });
});
