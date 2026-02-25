"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ShieldOff, Users } from "lucide-react";

import type { Access, Device, DeviceStatus, Host, User } from "@/types/api";
import { createUser, listUsers } from "@/lib/api/auth";
import { createAccess, deleteAccess, listAccesses } from "@/lib/api/access";
import { listDevices } from "@/lib/api/devices";
import { listHosts } from "@/lib/api/hosts";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function statusVariant(status?: DeviceStatus): "success" | "warning" | "danger" {
  if (status === "AVAILABLE") {
    return "success";
  }
  if (status === "BUSY") {
    return "warning";
  }
  return "danger";
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "never";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function isExpired(value: string | null): boolean {
  if (!value) {
    return false;
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return false;
  }
  return timestamp < Date.now();
}

export default function StudentsPage() {
  const { token, user } = useAuth();
  const [students, setStudents] = useState<User[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [accesses, setAccesses] = useState<Access[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [studentPassword, setStudentPassword] = useState("");
  const [studentError, setStudentError] = useState<string | null>(null);
  const [studentMessage, setStudentMessage] = useState<string | null>(null);
  const [isCreatingStudent, setIsCreatingStudent] = useState(false);
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [selectedStudentUuid, setSelectedStudentUuid] = useState("");
  const [selectedHostUuid, setSelectedHostUuid] = useState("");
  const [selectedDeviceUuids, setSelectedDeviceUuids] = useState<string[]>([]);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [grantMessage, setGrantMessage] = useState<string | null>(null);
  const [isGranting, setIsGranting] = useState(false);
  const [isGrantModalOpen, setIsGrantModalOpen] = useState(false);
  const [revokingAccessUuid, setRevokingAccessUuid] = useState<string | null>(null);
  const [revokingStudentUuid, setRevokingStudentUuid] = useState<string | null>(null);

  const canManage = useMemo(() => user?.role === "teacher", [user?.role]);

  const deviceLookup = useMemo(() => new Map(devices.map((device) => [device.uuid, device])), [devices]);
  const hostLookup = useMemo(() => new Map(hosts.map((host) => [host.uuid, host])), [hosts]);
  const studentLookup = useMemo(() => new Map(students.map((student) => [student.uuid, student])), [students]);
  const accessByDevice = useMemo(
    () => new Map(accesses.map((access) => [access.device_uuid, access])),
    [accesses],
  );
  const hostDevices = useMemo(
    () => devices.filter((device) => device.host_uuid === selectedHostUuid),
    [devices, selectedHostUuid],
  );
  const selectableDevices = useMemo(
    () =>
      hostDevices.filter(
        (device) => device.status === "AVAILABLE" && !accessByDevice.has(device.uuid),
      ),
    [accessByDevice, hostDevices],
  );
  const selectedDeviceSet = useMemo(() => new Set(selectedDeviceUuids), [selectedDeviceUuids]);

  const accessByStudent = useMemo(() => {
    const map = new Map<string, Access[]>();
    accesses.forEach((access) => {
      const list = map.get(access.user_uuid);
      if (list) {
        list.push(access);
      } else {
        map.set(access.user_uuid, [access]);
      }
    });
    return map;
  }, [accesses]);

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return students;
    }
    return students.filter((student) => {
      const nameMatch = student.full_name.toLowerCase().includes(query);
      const emailMatch = student.email.toLowerCase().includes(query);
      return nameMatch || emailMatch;
    });
  }, [search, students]);

  const orderedStudents = useMemo(
    () => [...filteredStudents].sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [filteredStudents],
  );

  const totalAssignments = accesses.length;
  const activeAssignments = useMemo(
    () => accesses.filter((access) => !isExpired(access.expires_at)).length,
    [accesses],
  );

  const fetchData = useCallback(async () => {
    if (!token) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [usersResult, devicesResult, hostsResult, accessResult] = await Promise.all([
        listUsers(token),
        listDevices(token, 1, 200),
        listHosts(token, 1, 200),
        listAccesses(token, 1, 500),
      ]);

      const nextStudents = (usersResult.data ?? []).filter((user) => user.role === "student");
      setStudents(nextStudents);
      setDevices(devicesResult.data ?? []);
      setHosts(hostsResult.data ?? []);
      setAccesses(accessResult.data ?? []);

      if (hostsResult.data?.length) {
        const candidate = hostsResult.data.some((host) => host.uuid === selectedHostUuid)
          ? selectedHostUuid
          : hostsResult.data[0].uuid;
        if (candidate !== selectedHostUuid) {
          setSelectedHostUuid(candidate);
        }
      } else if (selectedHostUuid) {
        setSelectedHostUuid("");
      }

      if (nextStudents.length) {
        const candidate = nextStudents.some((student) => student.uuid === selectedStudentUuid)
          ? selectedStudentUuid
          : nextStudents[0].uuid;
        if (candidate !== selectedStudentUuid) {
          setSelectedStudentUuid(candidate);
        }
      } else if (selectedStudentUuid) {
        setSelectedStudentUuid("");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`error ${err.status}: ${err.detail}`);
      } else {
        setError("error: failed to load students");
      }
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token || !canManage) {
      setIsLoading(false);
      return;
    }
    void fetchData();
  }, [token, canManage, fetchData]);

  useEffect(() => {
    setSelectedDeviceUuids([]);
  }, [selectedHostUuid]);

  useEffect(() => {
    setSelectedDeviceUuids((prev) => prev.filter((uuid) => !accessByDevice.has(uuid)));
  }, [accessByDevice]);

  const openStudentModal = useCallback(() => {
    setStudentError(null);
    setStudentMessage(null);
    setIsStudentModalOpen(true);
  }, []);

  const closeStudentModal = useCallback(() => {
    setIsStudentModalOpen(false);
    setStudentError(null);
    setStudentMessage(null);
  }, []);

  const openGrantModal = useCallback(() => {
    setGrantError(null);
    setGrantMessage(null);
    setIsGrantModalOpen(true);
  }, []);

  const closeGrantModal = useCallback(() => {
    setIsGrantModalOpen(false);
    setGrantError(null);
    setGrantMessage(null);
  }, []);

  const handleRefresh = () => {
    void fetchData();
  };

  const refreshAccesses = useCallback(async () => {
    if (!token) {
      return;
    }
    try {
      const accessResult = await listAccesses(token, 1, 500);
      setAccesses(accessResult.data ?? []);
    } catch (err) {
      if (err instanceof ApiError) {
        setGrantError(`error ${err.status}: ${err.detail}`);
      } else {
        setGrantError("Unable to refresh access list");
      }
    }
  }, [token]);

  const handleCreateStudent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) {
      return;
    }

    setStudentError(null);
    setStudentMessage(null);
    setIsCreatingStudent(true);
    try {
      const created = await createUser(token, {
        email: studentEmail,
        full_name: studentName,
        password: studentPassword,
        role: "student",
      });
      setStudents((prev) => [created, ...prev]);
      setStudentName("");
      setStudentEmail("");
      setStudentPassword("");
      setStudentMessage(`Student ${created.full_name} added.`);
    } catch (err) {
      if (err instanceof ApiError) {
        setStudentError(err.detail);
      } else {
        setStudentError("Unable to create student");
      }
    } finally {
      setIsCreatingStudent(false);
    }
  };

  const toggleDeviceSelection = (deviceUuid: string) => {
    setSelectedDeviceUuids((prev) =>
      prev.includes(deviceUuid) ? prev.filter((uuid) => uuid !== deviceUuid) : [...prev, deviceUuid],
    );
  };

  const handleSelectAllDevices = () => {
    if (selectableDevices.length === 0) {
      return;
    }
    setSelectedDeviceUuids(selectableDevices.map((device) => device.uuid));
  };

  const handleClearSelection = () => {
    setSelectedDeviceUuids([]);
  };

  const handleGrantAccess = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) {
      return;
    }

    setGrantError(null);
    setGrantMessage(null);

    if (!selectedStudentUuid) {
      setGrantError("Select a student to grant access.");
      return;
    }

    const selectableSet = new Set(selectableDevices.map((device) => device.uuid));
    const targetDevices = selectedDeviceUuids.filter((uuid) => selectableSet.has(uuid));
    if (targetDevices.length === 0) {
      setGrantError("Select at least one available device.");
      return;
    }

    setIsGranting(true);
    let successCount = 0;
    let firstError: string | null = null;

    for (const deviceUuid of targetDevices) {
      try {
        await createAccess(token, {
          user_uuid: selectedStudentUuid,
          device_uuid: deviceUuid,
        });
        successCount += 1;
      } catch (err) {
        if (!firstError) {
          if (err instanceof ApiError) {
            firstError = err.detail;
          } else {
            firstError = "Unable to grant access";
          }
        }
      }
    }

    await refreshAccesses();
    setSelectedDeviceUuids([]);

    if (successCount > 0) {
      setGrantMessage(`Granted access to ${successCount} device${successCount === 1 ? "" : "s"}.`);
    }
    if (firstError) {
      setGrantError(firstError);
    }

    setIsGranting(false);
  };

  const handleRevoke = async (access: Access) => {
    if (!token) {
      return;
    }
    setActionError(null);
    setActionMessage(null);
    setRevokingAccessUuid(access.uuid);
    try {
      await deleteAccess(token, access.uuid);
      setAccesses((prev) => prev.filter((item) => item.uuid !== access.uuid));
      setActionMessage("Access revoked.");
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(err.detail);
      } else {
        setActionError("Unable to revoke access");
      }
    } finally {
      setRevokingAccessUuid(null);
    }
  };

  const handleRevokeAll = async (studentUuid: string) => {
    if (!token) {
      return;
    }
    const entries = accessByStudent.get(studentUuid) ?? [];
    if (entries.length === 0) {
      return;
    }
    const confirmed = window.confirm("Revoke access to all devices for this student?");
    if (!confirmed) {
      return;
    }
    setActionError(null);
    setActionMessage(null);
    setRevokingStudentUuid(studentUuid);
    try {
      await Promise.all(entries.map((access) => deleteAccess(token, access.uuid)));
      setAccesses((prev) => prev.filter((item) => item.user_uuid !== studentUuid));
      setActionMessage("All access revoked for student.");
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(err.detail);
      } else {
        setActionError("Unable to revoke access");
      }
    } finally {
      setRevokingStudentUuid(null);
    }
  };

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Students</CardTitle>
          <CardDescription>Only teachers can manage student access.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">student access</p>
        <h2 className="mt-1 text-2xl font-semibold">Students</h2>
        <p className="text-sm text-muted-foreground">
          Review device assignments and revoke access when needed.
        </p>
      </section>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-4 w-4 text-primary" />
                Student access list
              </CardTitle>
              <CardDescription>
                {students.length} students, {activeAssignments} active assignments ({totalAssignments} total).
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={handleRefresh} disabled={isLoading}>
                Refresh
              </Button>
              <Button type="button" variant="secondary" onClick={openStudentModal}>
                Add student
              </Button>
              <Button type="button" onClick={openGrantModal}>
                Grant access
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or email"
              className="max-w-sm"
            />
            <p className="text-xs text-muted-foreground">
              Showing {orderedStudents.length} of {students.length}
            </p>
          </div>

          {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}
          {actionMessage ? <p className="text-sm text-emerald-600">{actionMessage}</p> : null}

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Devices</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderedStudents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                      No students found.
                    </TableCell>
                  </TableRow>
                ) : (
                  orderedStudents.map((student) => {
                    const studentAccesses = accessByStudent.get(student.uuid) ?? [];
                    const hasAssignments = studentAccesses.length > 0;

                    return (
                      <TableRow key={student.uuid}>
                        <TableCell className="align-top">
                          <div className="space-y-1">
                            <p className="font-medium">{student.full_name}</p>
                            <p className="text-xs text-muted-foreground">{student.email}</p>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          {hasAssignments ? (
                            <div className="space-y-2">
                              {studentAccesses.map((access) => {
                                const device = deviceLookup.get(access.device_uuid);
                                const hostName = device ? hostLookup.get(device.host_uuid)?.name : null;
                                const expired = isExpired(access.expires_at);
                                const revokeDisabled = revokingAccessUuid === access.uuid || revokingStudentUuid === student.uuid;

                                return (
                                  <div
                                    key={access.uuid}
                                    className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border/60 bg-secondary/20 p-2"
                                  >
                                    <div>
                                      <p className="text-sm font-medium">{device?.name ?? "Unknown device"}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {hostName ?? "Unknown host"}
                                        {device?.port ? ` - ${device.port}` : ""}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        Granted {formatTimestamp(access.granted_at)}. Expires {formatTimestamp(access.expires_at)}.
                                      </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Badge variant={statusVariant(device?.status)}>
                                        {device?.status ?? "MISSING"}
                                      </Badge>
                                      {expired ? <Badge variant="warning">expired</Badge> : null}
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        type="button"
                                        onClick={() => void handleRevoke(access)}
                                        disabled={revokeDisabled}
                                      >
                                        {revokingAccessUuid === access.uuid ? "Revoking..." : "Revoke"}
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">No devices assigned.</p>
                          )}
                        </TableCell>
                        <TableCell className="align-top text-right">
                          <Button
                            size="sm"
                            variant="secondary"
                            type="button"
                            onClick={() => void handleRevokeAll(student.uuid)}
                            disabled={!hasAssignments || revokingStudentUuid === student.uuid}
                          >
                            {revokingStudentUuid === student.uuid ? (
                              "Revoking..."
                            ) : (
                              <>
                                <ShieldOff className="mr-2 h-4 w-4" />
                                Revoke all
                              </>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Modal
        open={isStudentModalOpen}
        onClose={closeStudentModal}
        title="Add student"
        description="Create a student account for device access."
      >
        <form className="space-y-3" onSubmit={handleCreateStudent}>
          <div className="space-y-2">
            <Label htmlFor="student-name">Full name</Label>
            <Input
              id="student-name"
              value={studentName}
              onChange={(event) => setStudentName(event.target.value)}
              placeholder="Ada Lovelace"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="student-email">Email</Label>
            <Input
              id="student-email"
              type="email"
              value={studentEmail}
              onChange={(event) => setStudentEmail(event.target.value)}
              placeholder="student@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="student-password">Password</Label>
            <Input
              id="student-password"
              type="password"
              value={studentPassword}
              onChange={(event) => setStudentPassword(event.target.value)}
              placeholder="Minimum 8 characters"
              required
            />
          </div>
          {studentError ? <p className="text-sm text-destructive">{studentError}</p> : null}
          {studentMessage ? <p className="text-sm text-emerald-600">{studentMessage}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isCreatingStudent || !studentName || !studentEmail || !studentPassword}>
              {isCreatingStudent ? "Creating student..." : "Create student"}
            </Button>
            <Button type="button" variant="secondary" onClick={closeStudentModal}>
              Close
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={isGrantModalOpen}
        onClose={closeGrantModal}
        title="Assign devices"
        description="Select a student and grant access to available devices."
      >
        <form className="space-y-4" onSubmit={handleGrantAccess}>
          <div className="space-y-2">
            <Label htmlFor="access-student">Student</Label>
            <select
              id="access-student"
              value={selectedStudentUuid}
              onChange={(event) => setSelectedStudentUuid(event.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {students.length === 0 ? (
                <option value="">Create a student first</option>
              ) : (
                students.map((student) => (
                  <option key={student.uuid} value={student.uuid}>
                    {student.full_name} · {student.email}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="access-host">Host</Label>
            <select
              id="access-host"
              value={selectedHostUuid}
              onChange={(event) => setSelectedHostUuid(event.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {hosts.length === 0 ? (
                <option value="">Create a host first</option>
              ) : (
                hosts.map((host) => (
                  <option key={host.uuid} value={host.uuid}>
                    {host.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Devices on host</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleSelectAllDevices}
                  disabled={selectableDevices.length === 0}
                >
                  Select all available
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClearSelection}
                  disabled={selectedDeviceUuids.length === 0}
                >
                  Clear
                </Button>
              </div>
            </div>

            {selectedHostUuid ? (
              hostDevices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No devices linked to this host.</p>
              ) : (
                <div className="space-y-2 rounded-md border border-border/60 bg-secondary/20 p-3">
                  {hostDevices.map((device) => {
                    const access = accessByDevice.get(device.uuid);
                    const assignedStudent = access ? studentLookup.get(access.user_uuid) : null;
                    const disabled = device.status !== "AVAILABLE" || Boolean(access);

                    return (
                      <label
                        key={device.uuid}
                        className="flex items-start gap-3 rounded-md border border-border/60 bg-card/60 p-2"
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selectedDeviceSet.has(device.uuid)}
                          onChange={() => toggleDeviceSelection(device.uuid)}
                          disabled={disabled}
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{device.name}</p>
                          <p className="text-xs text-muted-foreground">{device.port}</p>
                          {access ? (
                            <p className="text-xs text-muted-foreground">
                              assigned to {assignedStudent?.full_name ?? `${access.user_uuid.slice(0, 8)}…`}
                            </p>
                          ) : null}
                        </div>
                        <Badge variant={statusVariant(device.status)}>{device.status}</Badge>
                      </label>
                    );
                  })}
                </div>
              )
            ) : (
              <p className="text-sm text-muted-foreground">Select a host to view devices.</p>
            )}
            <p className="text-xs text-muted-foreground">Selected: {selectedDeviceUuids.length}</p>
          </div>

          {grantError ? <p className="text-sm text-destructive">{grantError}</p> : null}
          {grantMessage ? <p className="text-sm text-emerald-600">{grantMessage}</p> : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isGranting || !selectedStudentUuid || selectedDeviceUuids.length === 0}>
              {isGranting ? "Granting..." : "Grant access"}
            </Button>
            <Button type="button" variant="secondary" onClick={closeGrantModal}>
              Close
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
