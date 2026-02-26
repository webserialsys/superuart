"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Cable, Cpu, TerminalSquare } from "lucide-react";

import type { Device, DeviceStatus, Host } from "@/types/api";
import { createDevice, listAvailableDevices, listDevices, updateDevice } from "@/lib/api/devices";
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
import { cn } from "@/lib/utils";

function statusVariant(status: DeviceStatus): "success" | "warning" | "danger" {
  if (status === "AVAILABLE") {
    return "success";
  }
  if (status === "BUSY") {
    return "warning";
  }
  return "danger";
}

const UART_BAUDRATE_OPTIONS = ["9600", "19200", "38400", "57600", "115200"] as const;

export default function DevicesPage() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [isSubmittingDevice, setIsSubmittingDevice] = useState(false);

  const [deviceName, setDeviceName] = useState("");
  const [devicePort, setDevicePort] = useState("");
  const [deviceBaudrate, setDeviceBaudrate] = useState("115200");
  const [deviceHostUuid, setDeviceHostUuid] = useState("");
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [editDeviceName, setEditDeviceName] = useState("");
  const [editDevicePort, setEditDevicePort] = useState("");
  const [editDeviceBaudrate, setEditDeviceBaudrate] = useState("115200");
  const [editDeviceStatus, setEditDeviceStatus] = useState<DeviceStatus>("AVAILABLE");
  const [editDeviceHostUuid, setEditDeviceHostUuid] = useState("");
  const [editDeviceError, setEditDeviceError] = useState<string | null>(null);
  const [isUpdatingDevice, setIsUpdatingDevice] = useState(false);

  const canManage = useMemo(() => user?.role === "teacher", [user?.role]);
  const hostLookup = useMemo(() => new Map(hosts.map((host) => [host.uuid, host])), [hosts]);

  const fetchTeacherData = useCallback(async () => {
    if (!token) {
      return;
    }

    const [devicesResult, hostsResult] = await Promise.all([listDevices(token), listHosts(token)]);
    setDevices(devicesResult.data ?? []);
    setHosts(hostsResult.data ?? []);

    if (!deviceHostUuid && hostsResult.data?.length) {
      setDeviceHostUuid(hostsResult.data[0].uuid);
    }
  }, [token, deviceHostUuid]);

  const handleConnect = useCallback(
    (device: Device) => {
      const nameParam = encodeURIComponent(device.name);
      router.push(`/terminal?device=${device.uuid}&name=${nameParam}`);
    },
    [router],
  );

  const openCreateDeviceModal = useCallback(() => {
    setEditingDevice(null);
    setDeviceError(null);
    setIsDeviceModalOpen(true);
  }, []);

  const closeDeviceModal = useCallback(() => {
    setIsDeviceModalOpen(false);
    setEditingDevice(null);
    setEditDeviceError(null);
  }, []);

  const beginEditDevice = useCallback((device: Device) => {
    setEditingDevice(device);
    setEditDeviceName(device.name);
    setEditDevicePort(device.port);
    setEditDeviceBaudrate(String(device.baudrate));
    setEditDeviceStatus(device.status);
    setEditDeviceHostUuid(device.host_uuid);
    setEditDeviceError(null);
    setIsDeviceModalOpen(true);
  }, []);

  const cancelEditDevice = useCallback(() => {
    closeDeviceModal();
  }, [closeDeviceModal]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const fetchDevices = async () => {
      setIsLoading(true);
      setError(null);
      try {
        if (canManage) {
          await fetchTeacherData();
        } else {
          const result = await listAvailableDevices(token);
          setDevices(result);
        }
      } catch (err) {
        if (err instanceof ApiError) {
          setError(`error ${err.status}: ${err.detail}`);
        } else {
          setError("error: failed to load devices");
        }
      } finally {
        setIsLoading(false);
      }
    };

    void fetchDevices();
  }, [token, canManage, fetchTeacherData]);

  const handleCreateDevice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) {
      return;
    }

    setDeviceError(null);
    setIsSubmittingDevice(true);
    try {
      await createDevice(token, {
        name: deviceName,
        port: devicePort,
        baudrate: Number(deviceBaudrate || "115200"),
        status: "AVAILABLE",
        host_uuid: deviceHostUuid,
      });
      setDeviceName("");
      setDevicePort("");
      setDeviceBaudrate("115200");
      await fetchTeacherData();
      setIsDeviceModalOpen(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setDeviceError(err.detail);
      } else {
        setDeviceError("Unable to create device");
      }
    } finally {
      setIsSubmittingDevice(false);
    }
  };

  const handleUpdateDevice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !editingDevice) {
      return;
    }

    setEditDeviceError(null);
    setIsUpdatingDevice(true);
    try {
      await updateDevice(token, editingDevice.uuid, {
        name: editDeviceName,
        port: editDevicePort,
        baudrate: Number(editDeviceBaudrate || "115200"),
        status: editDeviceStatus,
        host_uuid: editDeviceHostUuid,
      });
      await fetchTeacherData();
      closeDeviceModal();
    } catch (err) {
      if (err instanceof ApiError) {
        setEditDeviceError(err.detail);
      } else {
        setEditDeviceError("Unable to update device");
      }
    } finally {
      setIsUpdatingDevice(false);
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">device registry</p>
        <h2 className="mt-1 text-2xl font-semibold">UART devices</h2>
        <p className="text-sm text-muted-foreground">
          Connected to backend device registry with role-aware visibility.
        </p>
      </section>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Cable className="h-4 w-4 text-primary" />
                Device list
              </CardTitle>
              <CardDescription>
                {canManage
                  ? "Teacher view with full inventory and admin actions."
                  : "Student view limited to granted and available devices."}
              </CardDescription>
            </div>
            {canManage ? (
              <Button type="button" onClick={openCreateDeviceModal}>
                + Add device
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
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
                  <TableHead>Device</TableHead>
                  <TableHead>Port</TableHead>
                  <TableHead>Baudrate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      No devices available.
                    </TableCell>
                  </TableRow>
                ) : (
                  devices.map((device) => (
                    <TableRow key={device.uuid}>
                      <TableCell className="font-medium">{device.name}</TableCell>
                      <TableCell className="font-mono text-xs">{device.port}</TableCell>
                      <TableCell>{device.baudrate}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(device.status)}>{device.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {device.host_uuid
                          ? hostLookup.get(device.host_uuid)?.name ?? `${device.host_uuid.slice(0, 8)}…`
                          : "unassigned"}
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage ? (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              type="button"
                              onClick={() => beginEditDevice(device)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant={device.status === "AVAILABLE" ? "default" : "outline"}
                              disabled={device.status !== "AVAILABLE"}
                              type="button"
                              onClick={() => handleConnect(device)}
                            >
                              <TerminalSquare className="mr-2 h-4 w-4" />
                              Connect
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant={device.status === "AVAILABLE" ? "default" : "outline"}
                            disabled={device.status !== "AVAILABLE"}
                            type="button"
                            onClick={() => handleConnect(device)}
                          >
                            <TerminalSquare className="mr-2 h-4 w-4" />
                            Connect
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {canManage ? (
        <Modal
          open={isDeviceModalOpen}
          onClose={closeDeviceModal}
          title={editingDevice ? "Edit device" : "Add device"}
          description={
            editingDevice
              ? `Update device details for ${editingDevice.name}.`
              : "Register devices and assign them to existing hosts."
          }
        >
          {editingDevice ? (
            <form className="space-y-3" onSubmit={handleUpdateDevice}>
              <div className="space-y-2">
                <Label htmlFor="edit-device-name">Device name</Label>
                <Input
                  id="edit-device-name"
                  value={editDeviceName}
                  onChange={(event) => setEditDeviceName(event.target.value)}
                  placeholder="STM32 Nucleo F401"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-device-port">Port</Label>
                <Input
                  id="edit-device-port"
                  value={editDevicePort}
                  onChange={(event) => setEditDevicePort(event.target.value)}
                  placeholder="/dev/ttyUSB0"
                  required
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-device-baudrate">Baudrate</Label>
                  <Input
                    id="edit-device-baudrate"
                    type="number"
                    min="300"
                    value={editDeviceBaudrate}
                    onChange={(event) => setEditDeviceBaudrate(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-device-status">Status</Label>
                  <select
                    id="edit-device-status"
                    value={editDeviceStatus}
                    onChange={(event) => setEditDeviceStatus(event.target.value as DeviceStatus)}
                    className={cn(
                      "flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                  >
                    <option value="AVAILABLE">AVAILABLE</option>
                    <option value="BUSY">BUSY</option>
                    <option value="OFFLINE">OFFLINE</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-device-host">Host</Label>
                <select
                  id="edit-device-host"
                  value={editDeviceHostUuid}
                  onChange={(event) => setEditDeviceHostUuid(event.target.value)}
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
              {editDeviceError ? <p className="text-sm text-destructive">{editDeviceError}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  disabled={
                    isUpdatingDevice || !editDeviceName || !editDevicePort || !editDeviceHostUuid
                  }
                >
                  {isUpdatingDevice ? "Saving..." : "Save changes"}
                </Button>
                <Button type="button" variant="secondary" onClick={cancelEditDevice}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              {hosts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hosts yet. Create one in{" "}
                  <Link className="text-primary underline underline-offset-4" href="/hosts">
                    Hosts
                  </Link>
                  .
                </p>
              ) : null}
              <form className="space-y-3" onSubmit={handleCreateDevice}>
                <div className="space-y-2">
                  <Label htmlFor="device-name">Device name</Label>
                  <Input
                    id="device-name"
                    value={deviceName}
                    onChange={(event) => setDeviceName(event.target.value)}
                    placeholder="STM32 Nucleo F401"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="device-port">Port</Label>
                  <Input
                    id="device-port"
                    value={devicePort}
                    onChange={(event) => setDevicePort(event.target.value)}
                    placeholder="/dev/ttyUSB0"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="device-baudrate">Baudrate</Label>
                  <select
                    id="device-baudrate"
                    value={deviceBaudrate}
                    onChange={(event) => setDeviceBaudrate(event.target.value)}
                    className={cn(
                      "flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                    required
                  >
                    {UART_BAUDRATE_OPTIONS.map((baudrate) => (
                      <option key={baudrate} value={baudrate}>
                        {baudrate}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="device-host">Host</Label>
                  <select
                    id="device-host"
                    value={deviceHostUuid}
                    onChange={(event) => setDeviceHostUuid(event.target.value)}
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
                {deviceError ? <p className="text-sm text-destructive">{deviceError}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    disabled={isSubmittingDevice || !deviceName || !devicePort || !deviceHostUuid}
                  >
                    {isSubmittingDevice ? "Creating device..." : "Create device"}
                  </Button>
                  <Button type="button" variant="secondary" onClick={closeDeviceModal}>
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          )}
        </Modal>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Cpu className="h-4 w-4 text-primary" />
            Expansion notes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. add booking workflow and status locking for `BUSY` transitions.</p>
          <p>2. integrate xterm.js terminal route and WebSocket transport for UART streams.</p>
          <p>3. expose teacher CRUD actions once UI design is finalized.</p>
        </CardContent>
      </Card>
    </div>
  );
}
