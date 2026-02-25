import type { Device, DeviceStatus, PaginatedResponse } from "@/types/api";

import { apiRequest } from "./client";

export async function listDevices(
  token: string,
  page = 1,
  itemsPerPage = 50,
): Promise<PaginatedResponse<Device>> {
  const query = new URLSearchParams({
    page: String(page),
    items_per_page: String(itemsPerPage),
  });

  return apiRequest<PaginatedResponse<Device>>(`/api/v1/devices?${query.toString()}`, {
    method: "GET",
    token,
  });
}

export async function listAvailableDevices(token: string): Promise<Device[]> {
  return apiRequest<Device[]>("/api/v1/devices/available", {
    method: "GET",
    token,
  });
}

type DevicePayload = {
  name: string;
  port: string;
  baudrate: number;
  status: DeviceStatus;
  host_uuid: string;
};

export async function createDevice(token: string, payload: DevicePayload): Promise<Device> {
  return apiRequest<Device>("/api/v1/device", {
    method: "POST",
    token,
    body: payload,
  });
}

type DeviceUpdatePayload = Partial<DevicePayload>;

export async function updateDevice(
  token: string,
  deviceUuid: string,
  payload: DeviceUpdatePayload,
): Promise<Device> {
  return apiRequest<Device>(`/api/v1/device/${deviceUuid}`, {
    method: "PUT",
    token,
    body: payload,
  });
}
