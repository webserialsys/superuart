import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createUser,
  getCurrentUser,
  listUsers,
  login,
  logout,
  refreshAccessToken,
  register,
} from "@/lib/api/auth";

const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiRequest: apiRequestMock,
}));

describe("auth api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("login sends form-urlencoded credentials", async () => {
    apiRequestMock.mockResolvedValue({
      access_token: "token",
      token_type: "bearer",
    });

    await login("user@example.com", "password123");

    expect(apiRequestMock).toHaveBeenCalledTimes(1);

    const [path, options] = apiRequestMock.mock.calls[0];
    expect(path).toBe("/api/v1/login");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({
      "Content-Type": "application/x-www-form-urlencoded",
    });
    expect(options.body).toBeInstanceOf(URLSearchParams);

    const body = options.body as URLSearchParams;
    expect(body.get("username")).toBe("user@example.com");
    expect(body.get("password")).toBe("password123");
  });

  it("refreshAccessToken posts to refresh endpoint", async () => {
    apiRequestMock.mockResolvedValue({
      access_token: "token",
      token_type: "bearer",
    });

    await refreshAccessToken();

    expect(apiRequestMock).toHaveBeenCalledWith("/api/v1/refresh", {
      method: "POST",
    });
  });

  it("register sends payload as json body", async () => {
    apiRequestMock.mockResolvedValue({});

    await register({
      email: "student@example.com",
      full_name: "Test Student",
      password: "password123",
      role: "student",
    });

    expect(apiRequestMock).toHaveBeenCalledWith("/api/v1/user", {
      method: "POST",
      body: {
        email: "student@example.com",
        full_name: "Test Student",
        password: "password123",
        role: "student",
      },
    });
  });

  it("createUser sends token and payload", async () => {
    apiRequestMock.mockResolvedValue({});

    await createUser("admin-token", {
      email: "teacher@example.com",
      full_name: "Teacher",
      password: "password123",
      role: "teacher",
    });

    expect(apiRequestMock).toHaveBeenCalledWith("/api/v1/user", {
      method: "POST",
      token: "admin-token",
      body: {
        email: "teacher@example.com",
        full_name: "Teacher",
        password: "password123",
        role: "teacher",
      },
    });
  });

  it("getCurrentUser requests profile with bearer token", async () => {
    apiRequestMock.mockResolvedValue({});

    await getCurrentUser("user-token");

    expect(apiRequestMock).toHaveBeenCalledWith("/api/v1/user/me/", {
      method: "GET",
      token: "user-token",
    });
  });

  it("listUsers and logout use expected methods and paths", async () => {
    apiRequestMock.mockResolvedValue({});

    await listUsers("user-token");
    await logout("user-token");

    expect(apiRequestMock).toHaveBeenNthCalledWith(1, "/api/v1/users", {
      method: "GET",
      token: "user-token",
    });
    expect(apiRequestMock).toHaveBeenNthCalledWith(2, "/api/v1/logout", {
      method: "POST",
      token: "user-token",
    });
  });
});
