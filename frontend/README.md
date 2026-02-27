# Super UART Frontend

Frontend for the Super UART project, built with Next.js, Tailwind CSS and shadcn/ui components.

## Stack

- Next.js (App Router, TypeScript)
- Tailwind CSS
- shadcn/ui primitives
- Native fetch API client with typed wrappers

## Pages

- `/` landing page
- `/login` sign in
- `/register` user registration
- `/dashboard` authenticated workspace overview
- `/hosts` teacher view for host inventory and access control
- `/students` teacher view for student account and permissions management
- `/devices` role-aware device list and management
- `/terminal` UART session screen

## Environment

Create `.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

## Run

```bash
bun install
bun run dev
```

## Build and test

```bash
bun run test
bun run build
```

## Integration notes

- Access token is stored in `localStorage` and sent as `Bearer` header.
- Backend API base URL is configured through `NEXT_PUBLIC_API_BASE_URL`.
