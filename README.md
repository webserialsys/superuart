# SuperUART

SuperUART — веб-платформа для управления UART-устройствами в учебной лаборатории.
Проект объединяет ролевую панель управления, блокировки сессий и терминал в браузере.

## Что умеет проект ⚙️

В системе две роли:

- `teacher`: управляет инфраструктурой и доступами;
- `student`: работает только с выданными устройствами.

Основной функционал:

- аутентификация через JWT (`login`, `refresh`, `logout`);
- регистрация и профиль пользователя;
- управление хостами (создание/редактирование/просмотр, выдача API-ключа при создании);
- реестр устройств (создание/редактирование/просмотр, контроль статусов и доступности);
- выдача доступов студентам к устройствам;
- жизненный цикл UART-сессий с lock-механикой в Redis;
- mock WebSocket UART-поток для тестирования терминала;

## Архитектура 🧱

| Слой | Стек | Назначение |
|---|---|---|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind, shadcn/ui, xterm.js | UI, авторизация, страницы устройств/сессий, терминал |
| Backend | FastAPI, SQLAlchemy 2.0, PostgreSQL, Redis, ARQ, Alembic | API, контроль доступа, lock/TTL сессий, фоновые задачи |

Основные директории:

```text
backend/   FastAPI-приложение, миграции, тесты, docker-конфигурация
frontend/  Next.js-приложение, API-клиент, UI-компоненты, тесты
```

## Страницы фронтенда

| Маршрут | Описание |
|---|---|
| `/` | Главная страница |
| `/login` | Вход |
| `/register` | Регистрация |
| `/dashboard` | Рабочая панель пользователя |
| `/hosts` | Инструменты преподавателя: хосты и управление доступами |
| `/students` | Инструменты преподавателя: студенты и выдача доступов |
| `/devices` | Ролевой список устройств и действия с ними |
| `/terminal` | UART-терминал на базе xterm + WebSocket |

## Быстрый запуск 🚀

### 1. Запуск backend (Docker)

Требования: Docker + Docker Compose.

```bash
cd backend
cp .env.example .env
docker compose up --build web worker db redis
```

Backend будет доступен по адресам:

- `http://127.0.0.1:8000`
- Swagger: `http://127.0.0.1:8000/docs`

### 2. Запуск frontend (Bun)

Требования: Bun `>=1.3`.

```bash
cd frontend
printf "NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000\n" > .env.local
bun install
bun run dev
```

Frontend будет доступен по адресу:

- `http://localhost:3000`

## Локальный запуск backend без Docker (опционально)

Если хотите запускать API напрямую через Python:

```bash
cd backend
cp .env.example src/.env
uv sync --extra dev --group dev
cd src
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Примечания:

- в этом режиме PostgreSQL и Redis должны быть доступны с хоста;
- при необходимости поправьте `POSTGRES_SERVER`, `POSTGRES_PORT`, `REDIS_*` в `backend/src/.env`.

## DevOps лабораторные

- Лабораторная работа 3: Kubernetes, HPA, Prometheus, Grafana и GHCR описаны в `lab3.md`.
- Лабораторная работа 4: SonarQube, Quality Gate, Argo CD и Telegram описаны в `lab4.md`.

## Тесты ✅

Frontend:

```bash
cd frontend
bun run test
bun run test:coverage
```

Backend:

```bash
cd backend
docker compose run --rm pytest
```

или локально через `uv`:

```bash
cd backend
uv sync --extra dev --group dev
uv run pytest tests
```

## API префикс

Все REST-эндпоинты доступны под префиксом:

```text
/api/v1
```

Примеры групп: `login`, `users`, `hosts`, `devices`, `sessions`, `access`, `tasks`, `ws`.
