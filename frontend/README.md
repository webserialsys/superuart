# Super UART Frontend

Frontend for the Super UART project, built with Next.js, Tailwind CSS and shadcn/ui components.

## Stack

- Next.js (App Router, TypeScript)
- Tailwind CSS
- shadcn/ui primitives
- Native fetch API client with typed wrappers

## Implemented pages

- `/` landing page
- `/login` auth form (`POST /api/v1/login`)
- `/register` user registration (`POST /api/v1/user`)
- `/dashboard` protected page with:
  - current user (`GET /api/v1/user/me/`)
  - service health (`GET /api/v1/health`)
  - async task sandbox (`POST /api/v1/tasks/task`, `GET /api/v1/tasks/task/{id}`)
- `/devices` protected scaffold page for future device CRUD + terminal flows

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

## Notes on backend integration

- Access token is stored in `localStorage` and sent as `Bearer` header.
- Refresh endpoint is integrated (`POST /api/v1/refresh`), but backend currently sets refresh cookie with `secure=true`.
- In plain HTTP local dev, browser may not store secure cookie, so refresh flow can be limited until HTTPS is enabled.

## Extension points

1. Replace mocked device table with real API calls when backend device endpoints are added.
2. Add role-aware UI gates for student/teacher workflows.
3. Add xterm.js route and WebSocket transport for UART stream.
