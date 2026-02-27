import React from "react";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import StudentsPage from "@/app/(app)/students/page";

const {
  useAuthMock,
  listUsersMock,
  listDevicesMock,
  listHostsMock,
  listAccessesMock,
  createUserMock,
  createAccessMock,
  deleteAccessMock,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  listUsersMock: vi.fn(),
  listDevicesMock: vi.fn(),
  listHostsMock: vi.fn(),
  listAccessesMock: vi.fn(),
  createUserMock: vi.fn(),
  createAccessMock: vi.fn(),
  deleteAccessMock: vi.fn(),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/lib/api/auth", () => ({
  listUsers: listUsersMock,
  createUser: createUserMock,
}));

vi.mock("@/lib/api/devices", () => ({
  listDevices: listDevicesMock,
}));

vi.mock("@/lib/api/hosts", () => ({
  listHosts: listHostsMock,
}));

vi.mock("@/lib/api/access", () => ({
  listAccesses: listAccessesMock,
  createAccess: createAccessMock,
  deleteAccess: deleteAccessMock,
}));

const teacherUser = {
  uuid: "teacher-1",
  email: "teacher@example.com",
  full_name: "Teacher",
  role: "teacher" as const,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: null,
};

const studentA = {
  uuid: "student-a",
  email: "adam@example.com",
  full_name: "Adam Student",
  role: "student" as const,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: null,
};

const studentB = {
  uuid: "student-b",
  email: "zoe@example.com",
  full_name: "Zoe Student",
  role: "student" as const,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: null,
};

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

const accessA = {
  uuid: "access-a",
  user_uuid: "student-a",
  device_uuid: "device-a",
  granted_at: "2026-01-01T00:00:00Z",
  expires_at: null,
};

describe("StudentsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({
      token: "token-1",
      user: teacherUser,
    });
    listUsersMock.mockResolvedValue({ data: [teacherUser, studentA, studentB] });
    listDevicesMock.mockResolvedValue({ data: [deviceA] });
    listHostsMock.mockResolvedValue({ data: [hostA] });
    listAccessesMock.mockResolvedValue({ data: [accessA] });
    createUserMock.mockResolvedValue({
      ...studentB,
      uuid: "student-c",
      full_name: "New Student",
      email: "new@example.com",
    });
    createAccessMock.mockResolvedValue({
      uuid: "access-b",
      user_uuid: "student-b",
      device_uuid: "device-a",
      granted_at: "2026-01-01T00:00:00Z",
      expires_at: null,
    });
    deleteAccessMock.mockResolvedValue({ message: "ok" });
  });

  it("shows restricted card for non-teacher role", () => {
    useAuthMock.mockReturnValue({
      token: "token-1",
      user: { ...teacherUser, role: "student" as const },
    });

    render(<StudentsPage />);

    expect(screen.getByText(/Only teachers can manage student access/i)).toBeInTheDocument();
    expect(listUsersMock).not.toHaveBeenCalled();
  });

  it("renders loaded students and supports search filter", async () => {
    const user = userEvent.setup();
    render(<StudentsPage />);

    expect(await screen.findByText("Adam Student")).toBeInTheDocument();
    expect(screen.getByText("Zoe Student")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/search by name or email/i), "zoe");
    expect(screen.queryByText("Adam Student")).not.toBeInTheDocument();
    expect(screen.getByText("Zoe Student")).toBeInTheDocument();
  });

  it("revokes single access assignment", async () => {
    const user = userEvent.setup();
    render(<StudentsPage />);

    await screen.findByText("Adam Student");
    await user.click(screen.getByRole("button", { name: /^revoke$/i }));

    await waitFor(() => {
      expect(deleteAccessMock).toHaveBeenCalledWith("token-1", "access-a");
    });
    expect(await screen.findByText("Access revoked.")).toBeInTheDocument();
  });

  it("revokes all accesses for a student after confirmation", async () => {
    const user = userEvent.setup();
    const confirmMock = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<StudentsPage />);
    await screen.findByText("Adam Student");

    const row = screen.getByText("Adam Student").closest("tr") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: /revoke all/i }));

    await waitFor(() => {
      expect(deleteAccessMock).toHaveBeenCalledWith("token-1", "access-a");
    });
    expect(await screen.findByText("All access revoked for student.")).toBeInTheDocument();
    expect(confirmMock).toHaveBeenCalled();
    confirmMock.mockRestore();
  });
});
