"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Cable, LayoutGrid, LogOut, Server, TerminalSquare, Users } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid, teacherOnly: true },
  { href: "/hosts", label: "Hosts", icon: Server, teacherOnly: true },
  { href: "/students", label: "Students", icon: Users, teacherOnly: true },
  { href: "/devices", label: "Devices", icon: Cable },
  { href: "/terminal", label: "Terminal", icon: TerminalSquare },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  useEffect(() => {
    if (user?.role !== "student") {
      return;
    }

    const normalized = pathname || "";
    const allowed = normalized === "/devices" || normalized.startsWith("/devices/") || normalized === "/terminal" || normalized.startsWith("/terminal/");

    if (!allowed) {
      router.replace("/devices");
    }
  }, [pathname, router, user?.role]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(8,145,178,0.16),transparent_50%),radial-gradient(circle_at_bottom_left,rgba(15,23,42,0.12),transparent_45%)]">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-6 px-4 py-6 md:grid-cols-[240px_1fr] md:px-6">
        <aside className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-panel backdrop-blur md:p-5">
          <div className="mb-8 space-y-1">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">Super UART</p>
            <h1 className="text-lg font-semibold">Control panel</h1>
          </div>

          <nav className="space-y-1">
            {navigation
              .filter((item) => !item.teacherOnly || user?.role === "teacher")
              .map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;

              if (item.disabled) {
                return (
                  <span
                    key={item.href}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground/60"
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </span>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 rounded-lg border border-border/70 bg-secondary/35 p-3">
            <p className="truncate text-sm font-medium">{user?.full_name}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
            <Button className="mt-3 w-full" variant="outline" onClick={() => void logout()}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </aside>

        <main className="animate-fade-up rounded-2xl border border-border/60 bg-card/85 p-5 shadow-panel backdrop-blur md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
