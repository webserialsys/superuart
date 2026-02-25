import type { Access, PaginatedResponse } from "@/types/api";

import { apiRequest } from "./client";

type AccessPayload = {
  user_uuid: string;
  device_uuid: string;
  expires_at?: string | null;
};

export async function listAccesses(
  token: string,
  page = 1,
  itemsPerPage = 200,
): Promise<PaginatedResponse<Access>> {
  const query = new URLSearchParams({
    page: String(page),
    items_per_page: String(itemsPerPage),
  });

  return apiRequest<PaginatedResponse<Access>>(`/api/v1/accesses?${query.toString()}`, {
    method: "GET",
    token,
  });
}

export async function createAccess(token: string, payload: AccessPayload): Promise<Access> {
  return apiRequest<Access>("/api/v1/access", {
    method: "POST",
    token,
    body: payload,
  });
}

export async function deleteAccess(token: string, accessUuid: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/api/v1/access/${accessUuid}`, {
    method: "DELETE",
    token,
  });
}
