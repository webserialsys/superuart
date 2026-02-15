import Link from "next/link";
import { ArrowRight, Cable, ShieldCheck, Terminal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const cards = [
  {
    icon: ShieldCheck,
    title: "Auth + RBAC",
    description: "JWT authorization flow is already wired to backend endpoints and prepared for role-based UI gates.",
  },
  {
    icon: Cable,
    title: "Device Workflows",
    description: "Device screens are scaffolded to grow from mock data to real CRUD and booking sessions.",
  },
  {
    icon: Terminal,
    title: "UART Ready",
    description: "UI architecture keeps a dedicated path for xterm.js and WebSocket features from the next stages.",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-4 py-10 md:px-8">
      <div className="animate-fade-up space-y-6">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">super uart / web console</p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight md:text-5xl">
          Minimal interface for embedded dev workflows and remote UART sessions
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          This frontend is integrated with the current FastAPI API and structured for progressive delivery: auth, devices,
          live terminal and monitoring.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/login">
              Open workspace
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/register">Create account</Link>
          </Button>
        </div>
      </div>

      <section className="mt-10 grid gap-4 md:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title}>
              <CardHeader>
                <Icon className="h-5 w-5 text-primary" />
                <CardTitle className="mt-2 text-lg">{card.title}</CardTitle>
                <CardDescription>{card.description}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0" />
            </Card>
          );
        })}
      </section>
    </main>
  );
}
