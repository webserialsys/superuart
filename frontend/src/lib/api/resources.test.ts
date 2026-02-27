import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAccess, deleteAccess, listAccesses } from "@/lib/api/access";
import { createDevice, listAvailableDevices, listDevices, updateDevice } from "@/lib/api/devices";
import { createHost, listHosts, updateHost } from "@/lib/api/hosts";
import { getHealth, getReady } from "@/lib/api/system";

const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiRequest: apiRequestMock,
}));

describe("resource api wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiRequestMock.mockResolvedValue({});
  });

  it("builds devices endpoints and payloads", async () => {
    await listDevices("token");
    await listDevices("token", 3, 25);
    await listAvailableDevices("token");
    await createDevice("token", { name: "Board A", port: "/dev/ttyUSB0", host_uuid: "host-1" });
    await updateDevice("token", "device-1", { name: "Board B", is_enabled: false });

    expect(apiRequestMock).toHaveBeenNthCalledWith(1, "/api/v1/devices?page=1&items_per_page=50", {
      method: "GET",
      token: "token",
    });
    expect(apiRequestMock).toHaveBeenNthCalledWith(2, "/api/v1/devices?page=3&items_per_page=25", {
      method: "GET",
      token: "token",
    });
    expect(apiRequestMock).toHaveBeenNthCalledWith(3, "/api/v1/devices/available", {
      method: "GET",
      token: "token",
    });
    expect(apiRequestMock).toHaveBeenNthCalledWith(4, "/api/v1/device", {
      method: "POST",
      token: "token",
      body: { name: "Board A", port: "/dev/ttyUSB0", host_uuid: "host-1" },
    });
    expect(apiRequestMock).toHaveBeenNthCalledWith(5, "/api/v1/device/device-1", {
      method: "PUT",
      token: "token",
      body: { name: "Board B", is_enabled: false },
    });
  });

  it("builds hosts endpoints and payloads", async () => {
    await listHosts("token");
    await listHosts("token", 2, 10);
    await createHost("token", { name: "Host A", status: "ONLINE" });
    await updateHost("token", "host-1", { status: "OFFLINE" });

    expect(apiRequestMock).toHaveBeenNthCalledWith(1, "/api/v1/hosts?page=1&items_per_page=50", {
      method: "GET",
      token: "token",
    });
    expect(apiRequestMock).toHaveBeenNthCalledWith(2, "/api/v1/hosts?page=2&items_per_page=10", {
      method: "GET",
      token: "token",
    });
    expect(apiRequestMock).toHaveBeenNthCalledWith(3, "/api/v1/host", {
      method: "POST",
      token: "token",
      body: { name: "Host A", status: "ONLINE" },
    });
    expect(apiRequestMock).toHaveBeenNthCalledWith(4, "/api/v1/host/host-1", {
      method: "PUT",
      token: "token",
      body: { status: "OFFLINE" },
    });
  });

  it("builds access endpoints and payloads", async () => {
    await listAccesses("token");
    await listAccesses("token", 4, 50);
    await createAccess("token", { user_uuid: "user-1", device_uuid: "device-1", expires_at: null });
    await deleteAccess("token", "access-1");

    expect(apiRequestMock).toHaveBeenNthCalledWith(1, "/api/v1/accesses?page=1&items_per_page=200", {
      method: "GET",
      token: "token",
    });
    expect(apiRequestMock).toHaveBeenNthCalledWith(2, "/api/v1/accesses?page=4&items_per_page=50", {
      method: "GET",
      token: "token",
    });
    expect(apiRequestMock).toHaveBeenNthCalledWith(3, "/api/v1/access", {
      method: "POST",
      token: "token",
      body: { user_uuid: "user-1", device_uuid: "device-1", expires_at: null },
    });
    expect(apiRequestMock).toHaveBeenNthCalledWith(4, "/api/v1/access/access-1", {
      method: "DELETE",
      token: "token",
    });
  });

  it("builds system endpoints", async () => {
    await getHealth();
    await getReady();

    expect(apiRequestMock).toHaveBeenNthCalledWith(1, "/api/v1/health");
    expect(apiRequestMock).toHaveBeenNthCalledWith(2, "/api/v1/ready");
  });
});
