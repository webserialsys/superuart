import type { AnchorHTMLAttributes } from "react";
import React from "react";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DevicesPage from "@/app/(app)/devices/page";

const {
  pushMock,
  useAuthMock,
  listDevicesMock,
  listAvailableDevicesMock,
  listHostsMock,
  createDeviceMock,
  updateDeviceMock,
  toastSuccessMock,
  toastWarningMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  useAuthMock: vi.fn(),
  listDevicesMock: vi.fn(),
  listAvailableDevicesMock: vi.fn(),
  listHostsMock: vi.fn(),
  createDeviceMock: vi.fn(),
  updateDeviceMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastWarningMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/lib/api/devices", () => ({
  listDevices: listDevicesMock,
  listAvailableDevices: listAvailableDevicesMock,
  createDevice: createDeviceMock,
  updateDevice: updateDeviceMock,
}));

vi.mock("@/lib/api/hosts", () => ({
  listHosts: listHostsMock,
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    warning: toastWarningMock,
    error: toastErrorMock,
  },
}));

const hostA = {
  uuid: "host-a",
  name: "Host A",
  status: "ONLINE" as const,
  user_uuid: "teacher-1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: null,
};

const deviceA = {
  uuid: "device-a",
  name: "Lab Board",
  port: "/dev/ttyUSB0",
  baudrate: 115200,
  status: "AVAILABLE" as const,
  host_uuid: "host-a",
  occupied_by_user_uuid: null,
  occupied_by_label: null,
  occupied_by_you: false,
  active_session_uuid: null,
  active_session_expires_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: null,
};

describe("DevicesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({
      token: "token-1",
      user: {
        uuid: "teacher-1",
        email: "teacher@example.com",
        full_name: "Teacher",
        role: "teacher",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: null,
      },
    });
    listDevicesMock.mockResolvedValue({ data: [deviceA] });
    listHostsMock.mockResolvedValue({ data: [hostA] });
    listAvailableDevicesMock.mockResolvedValue([deviceA]);
    createDeviceMock.mockResolvedValue(deviceA);
    updateDeviceMock.mockResolvedValue(deviceA);
  });

  it("loads teacher inventory and connects to terminal route", async () => {
    const user = userEvent.setup();
    render(<DevicesPage />);

    expect(await screen.findByText("Lab Board")).toBeInTheDocument();
    expect(screen.getByText("Host A")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\+ add device/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^connect$/i }));

    expect(pushMock).toHaveBeenCalledWith(
      "/terminal?device=device-a&name=Lab%20Board&baudrate=115200",
    );
    expect(listDevicesMock).toHaveBeenCalledWith("token-1");
    expect(listHostsMock).toHaveBeenCalledWith("token-1");
  });

  it("uses student mode endpoint and hides management actions", async () => {
    useAuthMock.mockReturnValue({
      token: "token-1",
      user: {
        uuid: "student-1",
        email: "student@example.com",
        full_name: "Student",
        role: "student",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: null,
      },
    });
    listAvailableDevicesMock.mockResolvedValue([
      {
        ...deviceA,
        status: "BUSY" as const,
        occupied_by_you: false,
      },
    ]);

    render(<DevicesPage />);

    expect(await screen.findByText("Lab Board")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /\+ add device/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();

    const connect = screen.getByRole("button", { name: /^connect$/i });
    expect(connect).toBeDisabled();
    expect(listAvailableDevicesMock).toHaveBeenCalledWith("token-1");
    expect(listDevicesMock).not.toHaveBeenCalled();
  });

  it("creates a device from modal form", async () => {
    const user = userEvent.setup();
    render(<DevicesPage />);

    await screen.findByText("Lab Board");
    await user.click(screen.getByRole("button", { name: /\+ add device/i }));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/^device name$/i), "Board B");
    await user.type(within(dialog).getByLabelText(/^port$/i), "/dev/ttyUSB1");
    await user.selectOptions(within(dialog).getByLabelText(/^host$/i), "host-a");
    await user.click(within(dialog).getByRole("button", { name: /^create device$/i }));

    await waitFor(() => {
      expect(createDeviceMock).toHaveBeenCalledWith("token-1", {
        name: "Board B",
        port: "/dev/ttyUSB1",
        host_uuid: "host-a",
      });
    });
  });

  it("updates a device from edit modal", async () => {
    const user = userEvent.setup();
    render(<DevicesPage />);

    await screen.findByText("Lab Board");
    await user.click(screen.getByRole("button", { name: /^edit$/i }));

    const dialog = await screen.findByRole("dialog");
    const nameInput = within(dialog).getByLabelText(/^device name$/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Board Updated");
    await user.click(within(dialog).getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(updateDeviceMock).toHaveBeenCalledWith("token-1", "device-a", {
        name: "Board Updated",
        port: "/dev/ttyUSB0",
        host_uuid: "host-a",
      });
    });
  });

  it("toggles activation and shows success toast", async () => {
    const user = userEvent.setup();
    listDevicesMock.mockResolvedValue({
      data: [
        {
          ...deviceA,
          status: "UNAVAILABLE" as const,
        },
      ],
    });

    render(<DevicesPage />);

    await screen.findByText("Lab Board");
    const toggle = screen.getByRole("checkbox");
    expect(toggle).not.toBeChecked();

    await user.click(toggle);

    await waitFor(() => {
      expect(updateDeviceMock).toHaveBeenCalledWith("token-1", "device-a", { is_enabled: true });
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Lab Board activated.");
  });
});
