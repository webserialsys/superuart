"use client";

import { Cable, Cpu, TerminalSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type DeviceStatus = "AVAILABLE" | "BUSY" | "OFFLINE";

type Device = {
  id: string;
  name: string;
  serial: string;
  baudrate: number;
  status: DeviceStatus;
  host: string;
};

const devices: Device[] = [
  {
    id: "dev-01",
    name: "STM32 Nucleo F401",
    serial: "NUCLEO-F401-01",
    baudrate: 115200,
    status: "AVAILABLE",
    host: "mock-host-01",
  },
  {
    id: "dev-02",
    name: "ESP32 DevKit",
    serial: "ESP32-DEV-17",
    baudrate: 115200,
    status: "BUSY",
    host: "mock-host-01",
  },
  {
    id: "dev-03",
    name: "RPi Pico",
    serial: "PICO-UART-09",
    baudrate: 9600,
    status: "OFFLINE",
    host: "mock-host-02",
  },
];

function statusVariant(status: DeviceStatus): "success" | "warning" | "danger" {
  if (status === "AVAILABLE") {
    return "success";
  }
  if (status === "BUSY") {
    return "warning";
  }
  return "danger";
}

export default function DevicesPage() {
  return (
    <div className="space-y-6">
      <section>
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">device registry</p>
        <h2 className="mt-1 text-2xl font-semibold">UART devices</h2>
        <p className="text-sm text-muted-foreground">
          Current table is a UI scaffold. Replace source with backend `Device CRUD` once endpoints are implemented.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Cable className="h-4 w-4 text-primary" />
            Device list
          </CardTitle>
          <CardDescription>
            Prepared for role-based actions: student booking and teacher/admin device management.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Serial</TableHead>
                <TableHead>Baudrate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Host</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.map((device) => (
                <TableRow key={device.id}>
                  <TableCell className="font-medium">{device.name}</TableCell>
                  <TableCell className="font-mono text-xs">{device.serial}</TableCell>
                  <TableCell>{device.baudrate}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(device.status)}>{device.status}</Badge>
                  </TableCell>
                  <TableCell>{device.host}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant={device.status === "AVAILABLE" ? "default" : "outline"} disabled={device.status !== "AVAILABLE"}>
                      <TerminalSquare className="mr-2 h-4 w-4" />
                      Connect
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Cpu className="h-4 w-4 text-primary" />
            Expansion notes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. replace mocked devices with `GET /devices` once backend endpoint is available.</p>
          <p>2. add booking workflow and status locking for `BUSY` transitions.</p>
          <p>3. integrate xterm.js terminal route and WebSocket transport for UART streams.</p>
        </CardContent>
      </Card>
    </div>
  );
}
