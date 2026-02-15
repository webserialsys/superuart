"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, Server } from "lucide-react";

import { TaskSandbox } from "@/components/dashboard/task-sandbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api/client";
import { getHealth } from "@/lib/api/system";
import type { HealthResponse } from "@/types/api";

export default function DashboardPage() {
  const { user } = useAuth();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    const loadHealth = async () => {
      try {
        const data = await getHealth();
        setHealth(data);
      } catch (error) {
        if (error instanceof ApiError) {
          setHealthError(`${error.status}: ${error.detail}`);
          return;
        }

        setHealthError("unable to load health endpoint");
      }
    };

    void loadHealth();
  }, []);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">workspace</p>
          <h2 className="mt-1 text-2xl font-semibold">Hello, {user?.full_name}</h2>
          <p className="text-sm text-muted-foreground">JWT session is active. API integration is running from this dashboard.</p>
        </div>
        <Button asChild>
          <Link href="/devices">
            Open devices
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Server className="h-4 w-4 text-primary" />
              Service status
            </CardTitle>
            <CardDescription>Live read from `/api/v1/health`.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {health ? (
              <>
                <div className="flex items-center gap-2">
                  <Badge variant={health.status === "healthy" ? "success" : "danger"}>{health.status}</Badge>
                  <span className="text-xs text-muted-foreground">environment: {health.environment}</span>
                </div>
                <p className="text-sm text-muted-foreground">version: {health.version || "unknown"}</p>
                <p className="text-sm text-muted-foreground">timestamp: {health.timestamp}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Loading...</p>
            )}

            {healthError ? <p className="text-sm text-red-600">{healthError}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-4 w-4 text-primary" />
              Session details
            </CardTitle>
            <CardDescription>Current authenticated user from `/api/v1/user/me/`.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              <span className="text-foreground">email:</span> {user?.email}
            </p>
            <p>
              <span className="text-foreground">uuid:</span> {user?.uuid}
            </p>
            <p>
              <span className="text-foreground">created:</span> {user?.created_at}
            </p>
            <p className="text-xs">
              refresh token cookie on backend is `secure=true`; in plain HTTP local env browser may skip cookie storage.
            </p>
          </CardContent>
        </Card>
      </section>

      <TaskSandbox />
    </div>
  );
}
