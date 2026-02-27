"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Server, ShieldCheck, UserPlus } from "lucide-react";

import type { Access, Device, DeviceStatus, Host, HostStatus, User } from "@/types/api";
import { createUser, listUsers } from "@/lib/api/auth";
import { createAccess, listAccesses } from "@/lib/api/access";
import { listDevices } from "@/lib/api/devices";
import { createHost, listHosts, updateHost } from "@/lib/api/hosts";
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
import { cn } from "@/lib/utils";

function statusVariant(status: HostStatus): "success" | "warning" | "danger" {
  if (status === "ONLINE") {
    return "success";
  }
  return "danger";
}

function deviceStatusVariant(status: DeviceStatus): "success" | "warning" | "danger" {
  if (status === "AVAILABLE") {
    return "success";
  }
  if (status === "BUSY") {
    return "warning";
  }
  return "danger";
}

export default function HostsPage() {
  const { token, user } = useAuth();
  const [hosts, setHosts] = useState<Host[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hostName, setHostName] = useState("");
  const [hostStatus, setHostStatus] = useState<HostStatus>("OFFLINE");
  const [issuedKey, setIssuedKey] = useState<string | null>(null);
  const [issuedHost, setIssuedHost] = useState<string | null>(null);
  const [isHostModalOpen, setIsHostModalOpen] = useState(false);
  const [editingHost, setEditingHost] = useState<Host | null>(null);
  const [editHostName, setEditHostName] = useState("");
  const [editHostStatus, setEditHostStatus] = useState<HostStatus>("OFFLINE");
  const [editHostError, setEditHostError] = useState<string | null>(null);
  const [isUpdatingHost, setIsUpdatingHost] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [accesses, setAccesses] = useState<Access[]>([]);
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

  const canManage = useMemo(() => user?.role === "teacher", [user?.role]);
  const accessByDevice = useMemo(
    () => new Map(accesses.map((access) => [access.device_uuid, access])),
    [accesses],
  );
  const studentLookup = useMemo(() => new Map(students.map((student) => [student.uuid, student])), [students]);
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

  const fetchData = useCallback(async () => {
    if (!token) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const [hostsResult, devicesResult, usersResult, accessResult] = await Promise.all([
        listHosts(token),
        listDevices(token, 1, 200),
        listUsers(token),
        listAccesses(token, 1, 500),
      ]);

      const nextHosts = hostsResult.data ?? [];
      const nextDevices = devicesResult.data ?? [];
      const nextStudents = (usersResult.data ?? []).filter((user) => user.role === "student");
      const nextAccesses = accessResult.data ?? [];

      setHosts(nextHosts);
      setDevices(nextDevices);
      setStudents(nextStudents);
      setAccesses(nextAccesses);

      if (nextHosts.length > 0) {
        const candidate = nextHosts.some((host) => host.uuid === selectedHostUuid)
          ? selectedHostUuid
          : nextHosts[0].uuid;
        if (candidate !== selectedHostUuid) {
          setSelectedHostUuid(candidate);
        }
      } else if (selectedHostUuid) {
        setSelectedHostUuid("");
      }

      if (nextStudents.length > 0) {
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
        setError("error: failed to load hosts");
      }
    } finally {
      setIsLoading(false);
    }
  }, [selectedHostUuid, selectedStudentUuid, token]);

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

  const handleCreateHost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) {
      return;
    }

    setFormError(null);
    setIssuedKey(null);
    setIssuedHost(null);
    setIsSubmitting(true);
    try {
      const result = await createHost(token, { name: hostName, status: hostStatus });
      setIssuedKey(result.api_key);
      setIssuedHost(result.host.name);
      setHosts((prev) => [result.host, ...prev]);
      if (!selectedHostUuid) {
        setSelectedHostUuid(result.host.uuid);
      }
      setHostName("");
      setHostStatus("OFFLINE");
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.detail);
      } else {
        setFormError("Unable to create host");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const openCreateHostModal = useCallback(() => {
    setEditingHost(null);
    setFormError(null);
    setIsHostModalOpen(true);
  }, []);

  const closeHostModal = useCallback(() => {
    setIsHostModalOpen(false);
    setEditingHost(null);
    setEditHostError(null);
  }, []);

  const beginEditHost = useCallback((host: Host) => {
    setEditingHost(host);
    setEditHostName(host.name);
    setEditHostStatus(host.status);
    setEditHostError(null);
    setIsHostModalOpen(true);
  }, []);

  const cancelEditHost = useCallback(() => {
    closeHostModal();
  }, [closeHostModal]);

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

  const handleUpdateHost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !editingHost) {
      return;
    }

    setEditHostError(null);
    setIsUpdatingHost(true);
    try {
      await updateHost(token, editingHost.uuid, { name: editHostName, status: editHostStatus });
      await fetchData();
      closeHostModal();
    } catch (err) {
      if (err instanceof ApiError) {
        setEditHostError(err.detail);
      } else {
        setEditHostError("Unable to update host");
      }
    } finally {
      setIsUpdatingHost(false);
    }
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

  const handleCreateStudent = async (event: FormEvent<HTMLFormElement>) => {
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
      setSelectedStudentUuid(created.uuid);
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

  const handleGrantAccess = async (event: FormEvent<HTMLFormElement>) => {
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

  const handleCopy = async () => {
    if (!issuedKey) {
      return;
    }
    try {
      await navigator.clipboard.writeText(issuedKey);
    } catch {
      // ignore
    }
  };

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Hosts</CardTitle>
          <CardDescription>Only teachers can manage host registrations.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">host registry</p>
        <h2 className="mt-1 text-2xl font-semibold">UART hosts</h2>
        <p className="text-sm text-muted-foreground">
          Create a host to receive an access key for the real UART gateway.
        </p>
      </section>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Server className="h-4 w-4 text-primary" />
                Host list
              </CardTitle>
              <CardDescription>Track registered UART gateways and their status.</CardDescription>
            </div>
            <Button type="button" onClick={openCreateHostModal}>
              + Add host
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-1/3" />
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
                  <TableHead>Host</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hosts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      No hosts registered.
                    </TableCell>
                  </TableRow>
                ) : (
                  hosts.map((host) => (
                    <TableRow key={host.uuid}>
                      <TableCell className="font-medium">{host.name}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(host.status)}>{host.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {host.user_uuid ? `${host.user_uuid.slice(0, 8)}…` : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="secondary" type="button" onClick={() => beginEditHost(host)}>
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Modal
        open={isHostModalOpen}
        onClose={closeHostModal}
        title={editingHost ? "Edit host" : "Issue access key"}
        description={
          editingHost
            ? `Update host details for ${editingHost.name}.`
            : "Generate a key once and store it on the host. The key is shown only one time."
        }
      >
        {editingHost ? (
          <form className="space-y-3" onSubmit={handleUpdateHost}>
            <div className="space-y-2">
              <Label htmlFor="edit-host-name">Host name</Label>
              <Input
                id="edit-host-name"
                value={editHostName}
                onChange={(event) => setEditHostName(event.target.value)}
                placeholder="uart-host-01"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-host-status">Status</Label>
              <select
                id="edit-host-status"
                value={editHostStatus}
                onChange={(event) => setEditHostStatus(event.target.value as HostStatus)}
                className={cn(
                  "flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <option value="OFFLINE">OFFLINE</option>
                <option value="ONLINE">ONLINE</option>
              </select>
            </div>

            {editHostError ? <p className="text-sm text-destructive">{editHostError}</p> : null}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={isUpdatingHost || !editHostName}>
                {isUpdatingHost ? "Saving..." : "Save changes"}
              </Button>
              <Button type="button" variant="secondary" onClick={cancelEditHost}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <form className="space-y-3" onSubmit={handleCreateHost}>
              <div className="space-y-2">
                <Label htmlFor="host-name">Host name</Label>
                <Input
                  id="host-name"
                  value={hostName}
                  onChange={(event) => setHostName(event.target.value)}
                  placeholder="uart-host-01"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="host-status">Status</Label>
                <select
                  id="host-status"
                  value={hostStatus}
                  onChange={(event) => setHostStatus(event.target.value as HostStatus)}
                  className={cn(
                    "flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                >
                  <option value="OFFLINE">OFFLINE</option>
                  <option value="ONLINE">ONLINE</option>
                </select>
              </div>

              {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={isSubmitting || !hostName}>
                  {isSubmitting ? "Creating host..." : "Create host"}
                </Button>
                <Button type="button" variant="secondary" onClick={closeHostModal}>
                  Close
                </Button>
              </div>
            </form>

            {issuedKey ? (
              <div className="rounded-lg border border-border/70 bg-secondary/40 p-4">
                <p className="text-sm text-muted-foreground">Key for {issuedHost}</p>
                <p className="mt-2 break-all font-mono text-sm">{issuedKey}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={handleCopy}>
                    Copy key
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </Modal>

      <section>
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">student access</p>
        <h2 className="mt-1 text-2xl font-semibold">Grant device access</h2>
        <p className="text-sm text-muted-foreground">
          Add students and assign them available devices by host or by specific selection.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserPlus className="h-4 w-4 text-primary" />
              Add student
            </CardTitle>
            <CardDescription>Create a student account for device access.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" onClick={openStudentModal}>
              Open student form
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Assign devices
            </CardTitle>
            <CardDescription>Select a student and grant access to available devices.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button type="button" onClick={openGrantModal}>
              Open access form
            </Button>
          </CardContent>
        </Card>
      </div>

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
              className={cn(
                "flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
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
              className={cn(
                "flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
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
                        <Badge variant={deviceStatusVariant(device.status)}>{device.status}</Badge>
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
