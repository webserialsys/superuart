import type { Host, HostCreateResponse, HostStatus, PaginatedResponse } from "@/types/api";

import { apiRequest } from "./client";

type HostPayload = {
  name: string;
  status: HostStatus;
};

export async function listHosts(
  token: string,
  page = 1,
  itemsPerPage = 50,
): Promise<PaginatedResponse<Host>> {
  const query = new URLSearchParams({
    page: String(page),
    items_per_page: String(itemsPerPage),
  });

  return apiRequest<PaginatedResponse<Host>>(`/api/v1/hosts?${query.toString()}`, {
    method: "GET",
    token,
  });
}

export async function createHost(token: string, payload: HostPayload): Promise<HostCreateResponse> {
  return apiRequest<HostCreateResponse>("/api/v1/host", {
    method: "POST",
    token,
    body: payload,
  });
}

type HostUpdatePayload = Partial<HostPayload>;

export async function updateHost(
  token: string,
  hostUuid: string,
  payload: HostUpdatePayload,
): Promise<Host> {
  return apiRequest<Host>(`/api/v1/host/${hostUuid}`, {
    method: "PUT",
    token,
    body: payload,
  });
}
