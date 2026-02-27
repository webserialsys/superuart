"use client";

import Link from "next/link";
import { Activity, ArrowRight, TerminalSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

export default function DashboardPage() {
  const { user } = useAuth();
  const isTeacher = user?.role === "teacher";

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">workspace</p>
          <h2 className="mt-1 text-2xl font-semibold">Hello, {user?.full_name}</h2>
          <p className="text-sm text-muted-foreground">Manage UART devices and terminal sessions from one place.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/devices">
              Open devices
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/terminal">
              Open terminal
              <TerminalSquare className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-4 w-4 text-primary" />
              Session details
            </CardTitle>
            <CardDescription>Current authenticated user profile.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              <span className="text-foreground">name:</span> {user?.full_name}
            </p>
            <p>
              <span className="text-foreground">email:</span> {user?.email}
            </p>
            <p>
              <span className="text-foreground">role:</span> {user?.role}
            </p>
            <p>
              <span className="text-foreground">uuid:</span> {user?.uuid}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick access</CardTitle>
            <CardDescription>{isTeacher ? "Teacher tools" : "Student tools"}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {isTeacher ? (
              <>
                <Button asChild variant="outline">
                  <Link href="/hosts">Manage hosts</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/students">Manage students</Link>
                </Button>
              </>
            ) : null}
            <Button asChild variant="outline">
              <Link href="/devices">Device list</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/terminal">Terminal</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
