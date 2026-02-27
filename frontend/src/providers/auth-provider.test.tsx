import React from "react";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ACCESS_TOKEN_KEY } from "@/lib/config";
import { ApiError } from "@/lib/api/client";
import { AuthProvider, useAuthContext } from "@/providers/auth-provider";

const {
  getCurrentUserMock,
  loginApiMock,
  logoutApiMock,
  refreshAccessTokenMock,
  registerApiMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  loginApiMock: vi.fn(),
  logoutApiMock: vi.fn(),
  refreshAccessTokenMock: vi.fn(),
  registerApiMock: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
  getCurrentUser: getCurrentUserMock,
  login: loginApiMock,
  logout: logoutApiMock,
  refreshAccessToken: refreshAccessTokenMock,
  register: registerApiMock,
}));

const baseUser = {
  uuid: "user-1",
  email: "user@example.com",
  full_name: "User",
  role: "student" as const,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: null,
};

function AuthHarness() {
  const auth = useAuthContext();

  return (
    <div>
      <div data-testid="loading">{String(auth.isLoading)}</div>
      <div data-testid="authenticated">{String(auth.isAuthenticated)}</div>
      <div data-testid="token">{auth.token ?? ""}</div>
      <div data-testid="email">{auth.user?.email ?? ""}</div>
      <button onClick={() => void auth.login("user@example.com", "password123")}>login</button>
      <button onClick={() => void auth.register("new@example.com", "New User", "password123", "teacher")}>
        register
      </button>
      <button onClick={() => void auth.logout()}>logout</button>
    </div>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();

    refreshAccessTokenMock.mockRejectedValue(new Error("No active session"));
    getCurrentUserMock.mockResolvedValue(baseUser);
    loginApiMock.mockResolvedValue({
      access_token: "login-token",
      token_type: "bearer",
    });
    registerApiMock.mockResolvedValue(baseUser);
    logoutApiMock.mockResolvedValue({ message: "ok" });
  });

  it("hydrates user from stored token", async () => {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, "stored-token");

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
      expect(screen.getByTestId("authenticated")).toHaveTextContent("true");
      expect(screen.getByTestId("token")).toHaveTextContent("stored-token");
      expect(screen.getByTestId("email")).toHaveTextContent("user@example.com");
    });

    expect(getCurrentUserMock).toHaveBeenCalledWith("stored-token");
    expect(refreshAccessTokenMock).not.toHaveBeenCalled();
  });

  it("refreshes session when stored token is unauthorized", async () => {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, "expired-token");
    getCurrentUserMock
      .mockRejectedValueOnce(new ApiError(401, "Expired token"))
      .mockResolvedValueOnce(baseUser);
    refreshAccessTokenMock.mockResolvedValue({
      access_token: "fresh-token",
      token_type: "bearer",
    });

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
      expect(screen.getByTestId("authenticated")).toHaveTextContent("true");
      expect(screen.getByTestId("token")).toHaveTextContent("fresh-token");
    });

    expect(getCurrentUserMock).toHaveBeenNthCalledWith(1, "expired-token");
    expect(refreshAccessTokenMock).toHaveBeenCalledTimes(1);
    expect(getCurrentUserMock).toHaveBeenNthCalledWith(2, "fresh-token");
    expect(window.localStorage.getItem(ACCESS_TOKEN_KEY)).toBe("fresh-token");
  });

  it("clears session when bootstrap refresh fails", async () => {
    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
      expect(screen.getByTestId("authenticated")).toHaveTextContent("false");
      expect(screen.getByTestId("token")).toHaveTextContent("");
      expect(screen.getByTestId("email")).toHaveTextContent("");
    });

    expect(window.localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
  });

  it("login stores token and loads user profile", async () => {
    const user = userEvent.setup();

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });

    await user.click(screen.getByRole("button", { name: "login" }));

    await waitFor(() => {
      expect(screen.getByTestId("authenticated")).toHaveTextContent("true");
      expect(screen.getByTestId("token")).toHaveTextContent("login-token");
      expect(screen.getByTestId("email")).toHaveTextContent("user@example.com");
    });

    expect(loginApiMock).toHaveBeenCalledWith("user@example.com", "password123");
    expect(getCurrentUserMock).toHaveBeenCalledWith("login-token");
    expect(window.localStorage.getItem(ACCESS_TOKEN_KEY)).toBe("login-token");
  });

  it("register delegates to register api and logs in", async () => {
    const user = userEvent.setup();
    loginApiMock.mockResolvedValue({
      access_token: "register-token",
      token_type: "bearer",
    });

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });

    await user.click(screen.getByRole("button", { name: "register" }));

    await waitFor(() => {
      expect(screen.getByTestId("authenticated")).toHaveTextContent("true");
      expect(screen.getByTestId("token")).toHaveTextContent("register-token");
      expect(screen.getByTestId("email")).toHaveTextContent("user@example.com");
    });

    expect(registerApiMock).toHaveBeenCalledWith({
      email: "new@example.com",
      full_name: "New User",
      password: "password123",
      role: "teacher",
    });
    expect(loginApiMock).toHaveBeenCalledWith("new@example.com", "password123");
  });

  it("logout calls api with current token and clears session", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(ACCESS_TOKEN_KEY, "stored-token");

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("authenticated")).toHaveTextContent("true");
    });

    await user.click(screen.getByRole("button", { name: "logout" }));

    await waitFor(() => {
      expect(screen.getByTestId("authenticated")).toHaveTextContent("false");
      expect(screen.getByTestId("token")).toHaveTextContent("");
      expect(screen.getByTestId("email")).toHaveTextContent("");
    });

    expect(logoutApiMock).toHaveBeenCalledWith("stored-token");
    expect(window.localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
  });
});
