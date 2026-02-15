import type { HealthResponse, ReadyResponse } from "@/types/api";

import { apiRequest } from "./client";

export async function getHealth(): Promise<HealthResponse> {
  return apiRequest<HealthResponse>("/api/v1/health");
}

export async function getReady(): Promise<ReadyResponse> {
  return apiRequest<ReadyResponse>("/api/v1/ready");
}
