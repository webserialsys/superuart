"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Cable, TerminalSquare, Zap } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { XtermPanel } from "@/components/terminal/xterm-panel";
import { getBaudrateOptions, normalizeBaudrate } from "@/lib/uart";
import { cn } from "@/lib/utils";

export default function TerminalPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const deviceName = searchParams.get("name");
  const deviceId = searchParams.get("device");
  const initialBaudrate = useMemo(() => normalizeBaudrate(searchParams.get("baudrate")), [searchParams]);
  const [baudrate, setBaudrate] = useState(initialBaudrate);
  const baudrateOptions = useMemo(() => getBaudrateOptions(baudrate), [baudrate]);
  const roleLabel = user?.role === "teacher" ? "Teacher mode" : "Student mode";
  const sessionLabel = deviceName?.trim()
    ? deviceName
    : deviceId
      ? `Device ${deviceId.slice(0, 8)}`
      : null;

  useEffect(() => {
    setBaudrate(initialBaudrate);
  }, [initialBaudrate]);

  return (
    <div className="space-y-6">
      <section>
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">terminal workspace</p>
        <h2 className="mt-1 text-2xl font-semibold">UART terminal</h2>
        <p className="text-sm text-muted-foreground">
          Live serial sessions will stream here. {roleLabel} is active.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TerminalSquare className="h-4 w-4 text-primary" />
            Terminal bridge
          </CardTitle>
          <CardDescription>Connect a device and open a session.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Step 1: Open the Devices page and pick a UART device.</p>
          <p>Step 2: Use the Connect action to start a session.</p>
          <p>Step 3: The live stream will appear here once transport is wired.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TerminalSquare className="h-4 w-4 text-primary" />
            Live terminal
          </CardTitle>
          <CardDescription>
            {sessionLabel ? `Ready for ${sessionLabel}.` : "No active device selected yet."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 space-y-2 sm:max-w-xs">
            <Label htmlFor="terminal-baudrate">Baudrate</Label>
            <select
              id="terminal-baudrate"
              value={baudrate}
              onChange={(event) => setBaudrate(event.target.value)}
              className={cn(
                "flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              {baudrateOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Changing baudrate reconnects the mock stream.</p>
          </div>
          <XtermPanel deviceName={deviceName} deviceId={deviceId} baudrate={baudrate} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Cable className="h-4 w-4 text-primary" />
              Devices
            </CardTitle>
            <CardDescription>
              {user?.role === "teacher"
                ? "Teachers can view all devices and manage inventory."
                : "Students see only granted and available devices."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/devices">Open devices</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap className="h-4 w-4 text-primary" />
              Session status
            </CardTitle>
            <CardDescription>
              {sessionLabel ? `Connected to ${sessionLabel}.` : "No active UART session."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {sessionLabel
              ? "Streaming will start once the UART transport is enabled."
              : "Select a device and start a session to activate the terminal stream."}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
