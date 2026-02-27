import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(8,145,178,0.15),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(15,23,42,0.2),transparent_55%)]">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-10 px-4 py-10 md:grid-cols-2 md:px-8">
        <section className="hidden flex-col justify-between rounded-2xl border border-border/60 bg-card/70 p-8 shadow-panel backdrop-blur md:flex">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">super uart</p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight">
              Secure access to your remote UART workspace
            </h1>
          </div>

          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Sign in to manage devices, control access, and start terminal sessions.</p>
            <p>Built for shared labs where teachers and students use the same hardware pool.</p>
          </div>
        </section>

        <section className="flex items-center justify-center">
          <div className="w-full max-w-md animate-fade-up">
            {children}
            <p className="mt-6 text-center text-xs text-muted-foreground">
              <Link href="/" className="underline decoration-primary/50 underline-offset-4">
                Back to landing
              </Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
