# SEODirect

Внутренний инструмент агентства для автоматизации поискового маркетинга.

## Документация

| Файл | Содержимое |
|------|------------|
| [`CLAUDE.md`](./CLAUDE.md) | Полный технический справочник: модели, роутеры, паттерны кода, API |
| [`SECURITY_AUDIT.md`](./SECURITY_AUDIT.md) | Аудит безопасности и производительности — статус исправлений (33/35 закрыто) |
| [`tz_seodirect_tool.md`](./tz_seodirect_tool.md) | Исходное ТЗ с актуальным статусом реализации |

## Быстрый старт

```bash
cp .env.example .env
# ОБЯЗАТЕЛЬНО: задать POSTGRES_PASSWORD, REDIS_PASSWORD, SECRET_KEY, ENCRYPTION_KEY
docker-compose up -d
docker-compose exec backend alembic upgrade head
docker-compose exec backend python init_superadmin.py
```

Открыть: `http://localhost` (Nginx → React frontend + FastAPI backend на `/api`)

### Production

```bash
docker-compose -f docker-compose.prod.yml up -d
docker-compose -f docker-compose.prod.yml exec backend alembic upgrade head
```

Prod-отличия: нет volume mounts, нет exposed портов (только nginx 80/443), Redis с `--requirepass`, SSL, 4 Celery-воркера.

## Стек

React 18 + TypeScript · FastAPI · PostgreSQL 16 · Redis 7 · Celery · Docker · Nginx

## CI

GitHub Actions: `ruff check` + `pytest` + `tsc --noEmit` (Node.js 22 LTS)
