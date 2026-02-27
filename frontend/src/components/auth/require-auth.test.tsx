import React from "react";

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RequireAuth } from "@/components/auth/require-auth";

const { replaceMock, pathnameMock, useAuthMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  pathnameMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => pathnameMock(),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => useAuthMock(),
}));

describe("RequireAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathnameMock.mockReturnValue("/dashboard");
    useAuthMock.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
    });
  });

  it("shows skeletons while auth status is loading", () => {
    const { container } = render(
      <RequireAuth>
        <div>Protected content</div>
      </RequireAuth>,
    );

    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(3);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated users with encoded next path", async () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    });
    pathnameMock.mockReturnValue("/hosts/list");

    render(
      <RequireAuth>
        <div>Protected content</div>
      </RequireAuth>,
    );

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/login?next=%2Fhosts%2Flist");
    });
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("falls back to /dashboard when pathname is unavailable", async () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    });
    pathnameMock.mockReturnValue(null);

    render(
      <RequireAuth>
        <div>Protected content</div>
      </RequireAuth>,
    );

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/login?next=%2Fdashboard");
    });
  });

  it("renders children for authenticated users", () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    render(
      <RequireAuth>
        <div>Protected content</div>
      </RequireAuth>,
    );

    expect(screen.getByText("Protected content")).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
