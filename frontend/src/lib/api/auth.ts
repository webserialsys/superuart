import type { PaginatedResponse, TokenResponse, User } from "@/types/api";

import { apiRequest } from "./client";

type RegisterPayload = {
  email: string;
  full_name: string;
  password: string;
};

export async function login(email: string, password: string): Promise<TokenResponse> {
  const body = new URLSearchParams();
  body.set("username", email);
  body.set("password", password);

  return apiRequest<TokenResponse>("/api/v1/login", {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
}

export async function refreshAccessToken(): Promise<TokenResponse> {
  return apiRequest<TokenResponse>("/api/v1/refresh", {
    method: "POST",
  });
}

export async function register(payload: RegisterPayload): Promise<User> {
  return apiRequest<User>("/api/v1/user", {
    method: "POST",
    body: payload,
  });
}

export async function getCurrentUser(token: string): Promise<User> {
  return apiRequest<User>("/api/v1/user/me/", {
    method: "GET",
    token,
  });
}

export async function listUsers(token: string): Promise<PaginatedResponse<User>> {
  return apiRequest<PaginatedResponse<User>>("/api/v1/users", {
    method: "GET",
    token,
  });
}

export async function logout(token: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>("/api/v1/logout", {
    method: "POST",
    token,
  });
}
