import React from "react";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import HostsPage from "@/app/(app)/hosts/page";

const {
  useAuthMock,
  listHostsMock,
  createHostMock,
  updateHostMock,
  listDevicesMock,
  listUsersMock,
  listAccessesMock,
  createUserMock,
  createAccessMock,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  listHostsMock: vi.fn(),
  createHostMock: vi.fn(),
  updateHostMock: vi.fn(),
  listDevicesMock: vi.fn(),
  listUsersMock: vi.fn(),
  listAccessesMock: vi.fn(),
  createUserMock: vi.fn(),
  createAccessMock: vi.fn(),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/lib/api/hosts", () => ({
  listHosts: listHostsMock,
  createHost: createHostMock,
  updateHost: updateHostMock,
}));

vi.mock("@/lib/api/devices", () => ({
  listDevices: listDevicesMock,
}));

vi.mock("@/lib/api/auth", () => ({
  listUsers: listUsersMock,
  createUser: createUserMock,
}));

vi.mock("@/lib/api/access", () => ({
  listAccesses: listAccessesMock,
  createAccess: createAccessMock,
}));

const hostA = {
  uuid: "host-a",
  name: "Host A",
  status: "ONLINE" as const,
  user_uuid: "teacher-1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: null,
};

const studentA = {
  uuid: "student-a",
  email: "student@example.com",
  full_name: "Student A",
  role: "student" as const,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: null,
};

const teacherUser = {
  uuid: "teacher-1",
  email: "teacher@example.com",
  full_name: "Teacher",
  role: "teacher" as const,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: null,
};

const deviceA = {
  uuid: "device-a",
  name: "Board A",
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

describe("HostsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({
      token: "token-1",
      user: teacherUser,
    });
    listHostsMock.mockResolvedValue({ data: [hostA] });
    listDevicesMock.mockResolvedValue({ data: [deviceA] });
    listUsersMock.mockResolvedValue({ data: [teacherUser, studentA] });
    listAccessesMock.mockResolvedValue({ data: [] });
    updateHostMock.mockResolvedValue(hostA);
    createHostMock.mockResolvedValue({
      host: {
        ...hostA,
        uuid: "host-b",
        name: "Host B",
      },
      api_key: "issued-key-1",
    });
    createUserMock.mockResolvedValue({
      ...studentA,
      uuid: "student-b",
      full_name: "Student B",
      email: "studentb@example.com",
    });
    createAccessMock.mockResolvedValue({
      uuid: "access-1",
      user_uuid: "student-a",
      device_uuid: "device-a",
      granted_at: "2026-01-01T00:00:00Z",
      expires_at: null,
    });
  });

  it("shows restricted card for non-teacher role", () => {
    useAuthMock.mockReturnValue({
      token: "token-1",
      user: { ...teacherUser, role: "student" as const },
    });

    render(<HostsPage />);

    expect(screen.getByText(/Only teachers can manage host registrations/i)).toBeInTheDocument();
    expect(listHostsMock).not.toHaveBeenCalled();
  });

  it("creates host and shows issued key", async () => {
    const user = userEvent.setup();
    render(<HostsPage />);

    await screen.findByText("Host A");
    await user.click(screen.getByRole("button", { name: /\+ add host/i }));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/host name/i), "Host B");
    await user.click(within(dialog).getByRole("button", { name: /create host/i }));

    await waitFor(() => {
      expect(createHostMock).toHaveBeenCalledWith("token-1", {
        name: "Host B",
        status: "OFFLINE",
      });
    });
    expect(await screen.findByText("issued-key-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy key/i })).toBeInTheDocument();
  });

  it("creates student from modal", async () => {
    const user = userEvent.setup();
    render(<HostsPage />);

    await screen.findByText("Host A");
    await user.click(screen.getByRole("button", { name: /open student form/i }));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/full name/i), "Student B");
    await user.type(within(dialog).getByLabelText(/email/i), "studentb@example.com");
    await user.type(within(dialog).getByLabelText(/password/i), "password123");
    await user.click(within(dialog).getByRole("button", { name: /create student/i }));

    await waitFor(() => {
      expect(createUserMock).toHaveBeenCalledWith("token-1", {
        email: "studentb@example.com",
        full_name: "Student B",
        password: "password123",
        role: "student",
      });
    });
    expect(await screen.findByText("Student Student B added.")).toBeInTheDocument();
  });

  it("grants access to selected available devices", async () => {
    const user = userEvent.setup();
    render(<HostsPage />);

    await screen.findByText("Host A");
    await user.click(screen.getByRole("button", { name: /open access form/i }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /select all available/i }));
    await user.click(within(dialog).getByRole("button", { name: /grant access/i }));

    await waitFor(() => {
      expect(createAccessMock).toHaveBeenCalledWith("token-1", {
        user_uuid: "student-a",
        device_uuid: "device-a",
      });
    });
    expect(await screen.findByText("Granted access to 1 device.")).toBeInTheDocument();
  });
});
