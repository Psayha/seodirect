# SEODirect

Внутренний инструмент агентства для автоматизации поискового маркетинга.

## Документация

| Файл | Содержимое |
|------|------------|
| [`CLAUDE.md`](./CLAUDE.md) | Полный технический справочник: модели, роутеры, паттерны кода, API |
| [`SECURITY_AUDIT.md`](./SECURITY_AUDIT.md) | Аудит безопасности и производительности — статус исправлений |
| [`tz_seodirect_tool.md`](./tz_seodirect_tool.md) | Исходное ТЗ с актуальным статусом реализации |

## Быстрый старт

```bash
cp .env.example .env        # заполнить переменные
docker-compose up -d
docker-compose exec backend alembic upgrade head
docker-compose exec backend python init_superadmin.py
```

Открыть: `http://localhost` (Nginx → React frontend + FastAPI backend на `/api`)

## Стек

React 18 + TypeScript · FastAPI · PostgreSQL · Redis · Celery · Docker
