# SEODirect — справочник для Claude

Внутренний инструмент агентства для автоматизации поискового маркетинга.
Помогает специалистам вести клиентские проекты: парсинг сайта → семантика → объявления → SEO/OG мета-теги → аналитика → экспорт.

---

## Стек

| Слой | Технологии |
|------|------------|
| Frontend | React 18 + TypeScript, Vite, Tailwind CSS, React Query (TanStack), Zustand, Axios |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, PostgreSQL 16 |
| Очереди | Celery + Redis |
| Парсинг | httpx + BeautifulSoup4 |
| Экспорт | openpyxl (XLSX), python-docx (DOCX), markdown (MD/HTML) |
| Auth | JWT (access 15 мин + refresh 30 дней), bcrypt |

---

## Структура проекта

```
seodirect/
├── backend/
│   ├── app/
│   │   ├── auth/          # JWT, deps (CurrentUser, NonViewerRequired, AdminRequired)
│   │   ├── crawl/         # crawler.py — парсинг сайта
│   │   ├── direct/        # service.py — генерация ключей/объявлений через Claude
│   │   ├── models/        # SQLAlchemy модели
│   │   ├── routers/       # FastAPI роутеры
│   │   ├── services/      # claude.py, wordstat.py, topvisor.py, metrika.py, exporter.py
│   │   ├── tasks/         # Celery задачи (crawl, direct, seo)
│   │   └── main.py        # подключение всех роутеров
│   └── alembic/versions/  # миграции БД
└── frontend/
    └── src/
        ├── api/           # HTTP-клиенты (auth, projects, direct, seo, og, analytics, mediaplan)
        └── pages/         # LoginPage, ProjectsPage, ProjectPage, SettingsPage, AdminUsersPage
```

---

## Роутеры (backend/app/routers/)

| Файл | Префикс | Что делает |
|------|---------|------------|
| `auth.py` | `/auth` | login, refresh token |
| `projects.py` | `/projects` | CRUD проектов + бриф + AI-чат |
| `brief_templates.py` | `/briefs` | 8 шаблонов брифов по нишам |
| `crawl.py` | — | парсинг сайта, отчёт, страницы |
| `direct.py` | — | стратегия, кампании, группы, ключи, объявления, минус-слова |
| `seo.py` | — | мета-теги, генерация, чеклист (19 пунктов), кластеризация |
| `og.py` | — | OG аудит, генерация, экспорт HTML |
| `mediaplan.py` | — | медиаплан (GET/PUT/reset) |
| `analytics.py` | — | Яндекс Метрика (counters, summary, sources, goals) |
| `topvisor.py` | — | link, позиции, снимки выдачи (конкуренты) |
| `content_plan.py` | — | контент-план (CRUD статей) |
| `export.py` | — | скачивание файлов (XLS, XLSX, DOCX, MD, HTML) |
| `reports.py` | — | автоотчёт клиенту (HTML preview + download) |
| `settings.py` | `/settings` | API-ключи, параметры парсера/ИИ, пользователи (admin only) |
| `users.py` | `/users` | CRUD пользователей (admin only) |
| `history.py` | — | лог событий по проекту |
| `tasks.py` | — | статус Celery-задач |

---

## Модели БД (backend/app/models/)

### Ключевые модели

**`User`** — `id, login, email, password_hash, role (super_admin/admin/specialist/viewer), is_active`

**`Project`** — `id, name, client_name, url, specialist_id→User, budget, status, notes`

**`Brief`** — `id, project_id→Project, niche, products, price_segment, geo, target_audience, pains, usp, competitors_urls (JSON), campaign_goal, ad_geo, excluded_geo, monthly_budget, restrictions, raw_data (JSON)`

**`CrawlSession`** — `id, project_id, status (pending/running/done/failed), pages_total, pages_done`

**`Page`** — `id, crawl_session_id, url, status_code, title, description, h1, h1_count, h2_list (JSON), canonical, og_title, og_description, og_image, og_type, robots_meta, word_count, internal_links (JSON), external_links (JSON), images_without_alt, load_time_ms, last_modified, priority`

**`Campaign`** — `id, project_id, name, type, priority, status, geo (JSON), budget_monthly, sitelinks (JSON), strategy_text`

**`AdGroup`** — `id, campaign_id, name, status`

**`Keyword`** — `id, ad_group_id, phrase, frequency, frequency_updated_at, temperature (hot/warm/cold), status, match_type`

**`NegativeKeyword`** — `id, project_id, campaign_id, phrase, block`

**`Ad`** — `id, ad_group_id, headline1/2/3 (56/30/30 chars), text (81 chars), display_url, utm, status, variant`

**`SeoPageMeta`** — `id, project_id, page_url, rec_title, rec_description, rec_og_title, rec_og_description, twitter_card, twitter_title, twitter_description, manually_edited`

**`MediaPlan`** — `id, project_id, rows (JSON — список из 12 месяцев), updated_at`
⚠️ Строки хранятся как JSON в одном поле `rows`, НЕ в отдельных записях БД.
Структура строки: `{month, month_name, pct, budget, forecast_clicks, forecast_leads, cpa}`

**`ContentPlanArticle`** — `id, project_id, title, target_keyword, cluster, intent, status (idea/outline/writing/review/published), priority, due_date, assigned_to, notes, word_count_target`

**`Task`** — `id, project_id, type, status (pending/running/success/failed), progress (0–100), celery_task_id, result (JSON), error, created_at, finished_at`

**`ProjectEvent`** — `id, project_id, user_id, event_type, description, created_at` — история действий

**`Setting`** — `id, key, value_encrypted` — API-ключи и настройки в зашифрованном виде (AES-256)

---

## Миграции (alembic/versions/)

| Файл | Что делает |
|------|------------|
| `0001_initial.py` | Базовые таблицы |
| `0002_...py` | ... |
| `0007_twitter_card.py` | Добавляет `twitter_card, twitter_title, twitter_description` в `seo_page_meta` |
| `0008_page_h1_count.py` | Добавляет `h1_count` в `pages` |

Применять: `alembic upgrade head`

---

## Авторизация и роли

```python
# backend/app/auth/deps.py
CurrentUser       # любой авторизованный — Annotated[User, Depends(get_current_user)]
NonViewerRequired # specialist/admin/super_admin — блокирует viewer на write-операциях
AdminRequired     # admin/super_admin
SuperAdminRequired # только super_admin
```

**Роли:**
- `super_admin` — полный доступ, управление всем
- `admin` — все проекты, управление пользователями
- `specialist` — только свои проекты (фильтрация по `specialist_id`)
- `viewer` — только чтение, все POST/PUT/PATCH/DELETE → 403

Super admin создаётся из `.env` (не через БД): `SUPER_ADMIN_LOGIN`, `SUPER_ADMIN_PASSWORD_HASH`.

---

## Внешние API

| Сервис | Где используется | Файл |
|--------|-----------------|------|
| Anthropic Claude | Генерация стратегии, ключей, объявлений, мета-тегов, OG, бриф-чат | `services/claude.py` |
| Яндекс Wordstat | Частотности ключей, динамика по месяцам | `services/wordstat.py` |
| Topvisor | Кластеризация, позиции, снимки выдачи | `services/topvisor.py` |
| Яндекс Метрика | Трафик, источники, цели | `services/metrika.py` |

Ключи хранятся в БД (таблица `settings`) в зашифрованном виде. Получать через `settings_service.get_api_key(db, service, key)`.

---

## Celery-задачи (backend/app/tasks/)

| Задача | Тип | Что делает |
|--------|-----|------------|
| `task_crawl_site` | crawl.py | Парсинг сайта (robots.txt → sitemap → страницы) |
| `task_generate_strategy` | direct.py | Генерация стратегии Директа через Claude |
| `task_check_frequencies` | direct.py | Массовая проверка частот через Wordstat |
| `task_generate_seo_meta` | seo.py | Генерация title/description/OG через Claude |

Фронт опрашивает статус через `GET /tasks/{task_id}`.

---

## Экспорт (backend/app/services/exporter.py)

| Функция | Формат | Эндпоинт |
|---------|--------|----------|
| `export_direct_xls` | XLS или ZIP (несколько кампаний) | `GET /projects/{id}/export/direct-xls` |
| `export_strategy_md` | Markdown | `GET /projects/{id}/export/strategy-md` |
| `export_strategy_html` | HTML | `GET /projects/{id}/export/strategy-html` |
| `export_copywriter_docx` | DOCX | `GET /projects/{id}/export/copywriter-brief` |
| `export_mediaplan_xlsx` | XLSX | `GET /projects/{id}/export/mediaplan-xlsx` |
| `validate_export` | JSON | `GET /projects/{id}/export/validate` |

Отчёт клиенту (отдельный роутер `reports.py`):
- `GET /projects/{id}/report/html` — скачать HTML-отчёт
- `GET /projects/{id}/report/preview` — просмотр в браузере

---

## SEO чеклист (19 пунктов)

`GET /projects/{id}/seo/checklist` возвращает статус `ok/warn/error` для каждого:

**Мета-теги:** без title, короткий title (<10), длинный title (>70), дублирующийся title, без description, короткое desc (<50), длинное desc (>160), дублирующееся desc

**Структура:** без H1, несколько H1, noindex, без canonical

**Производительность:** медленные страницы (>3с)

**Изображения:** без alt

**OpenGraph:** без og:title, без og:description, без og:image

**Ошибки:** 4xx, 5xx

---

## Фронтенд — вкладки проекта (ProjectPage.tsx)

`overview | brief | crawl | direct | seo | og | mediaplan | analytics | topvisor | content-plan | reports | history | export`

**DirectTab** включает суб-вкладки: стратегия / кампании (группы → ключи → объявления) / минус-слова

**Wordstat динамика:** кнопка 📈 у каждого ключа → компонент `WordstatSparkline` (CSS бар-чарт, последние 12 месяцев)

**OG Twitter Card:** поля в редакторе + экспорт в HTML-код

---

## Шаблоны брифов

`GET /briefs/templates` — список, `GET /briefs/templates/{id}` — полный шаблон.
Доступные ниши: `ecommerce, services_local, b2b_saas, real_estate, education, medicine, auto, beauty`

---

## Переменные окружения (.env)

```bash
SUPER_ADMIN_LOGIN=admin
SUPER_ADMIN_PASSWORD_HASH=$2b$12$...
SUPER_ADMIN_EMAIL=admin@company.ru

DATABASE_URL=postgresql://user:pass@postgres:5432/seodirect
REDIS_URL=redis://redis:6379/0

SECRET_KEY=64-char-random
ENCRYPTION_KEY=32-char-random

# API ключи (можно задать здесь или через веб-настройки)
ANTHROPIC_API_KEY=sk-ant-...
WORDSTAT_OAUTH_TOKEN=
TOPVISOR_API_KEY=
METRIKA_OAUTH_TOKEN=
```

---

## Запуск (Docker)

```bash
# Первый запуск
cp .env.example .env  # заполнить
docker-compose up -d
docker-compose exec backend alembic upgrade head
docker-compose exec backend python init_superadmin.py

# Обновление
git pull
docker-compose up -d --build
docker-compose exec backend alembic upgrade head
```

---

## Паттерны кода

### Backend — новый эндпоинт
```python
from app.auth.deps import CurrentUser, NonViewerRequired  # добавить NonViewerRequired на write

@router.post("/projects/{project_id}/something", status_code=201)
def do_something(
    project_id: uuid.UUID,
    body: SomeSchema,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],  # только для write-операций
    db: Annotated[Session, Depends(get_db)],
):
    ...
```

### Backend — новая миграция
Файл: `backend/alembic/versions/NNNN_description.py`
`revision = "NNNN"`, `down_revision = "NNNN-1"`

### Frontend — новый API-запрос
```typescript
// src/api/something.ts — новый модуль
import { api } from './client'
export const somethingApi = {
  get: (projectId: string) => api.get(`/projects/${projectId}/something`).then(r => r.data),
}

// В компоненте:
const { data } = useQuery({ queryKey: ['something', projectId], queryFn: () => somethingApi.get(projectId) })
const mutation = useMutation({ mutationFn: ..., onSuccess: () => qc.invalidateQueries(...) })
```
