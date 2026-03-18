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
│   │   ├── auth/              # JWT, deps (CurrentUser, NonViewerRequired, AdminRequired)
│   │   ├── crawl/             # crawler.py — парсинг сайта
│   │   ├── direct/            # service.py — генерация ключей/объявлений через Claude
│   │   ├── models/            # SQLAlchemy модели
│   │   ├── routers/           # FastAPI роутеры
│   │   ├── services/          # claude.py, wordstat.py, topvisor.py, metrika.py, exporter.py, pagespeed.py
│   │   ├── tasks/             # Celery задачи (crawl, direct, seo, reports)
│   │   └── main.py            # подключение всех роутеров
│   └── alembic/versions/      # миграции БД (0001–0011)
└── frontend/
    └── src/
        ├── api/               # HTTP-клиенты
        └── pages/
            ├── tabs/          # компоненты вкладок ProjectPage (после рефакторинга)
            ├── ProjectPage.tsx
            ├── PortalPage.tsx # публичный портал для клиентов (/portal/:token)
            └── ...
```

---

## Роутеры (backend/app/routers/)

| Файл | Что делает |
|------|------------|
| `auth.py` | login, refresh token |
| `projects.py` | CRUD проектов + бриф + AI-чат + `POST /duplicate` |
| `brief_templates.py` | 8 шаблонов брифов по нишам |
| `crawl.py` | парсинг, отчёт, страницы, перелинковка, редиректы, robots-audit, CWV |
| `direct.py` | стратегия, кампании, группы, ключи, объявления, минус-слова |
| `direct_analysis.py` | n-граммы, тепловая карта, A/B статистика, кластеризация, анализ запросов |
| `seo.py` | мета-теги, генерация (batch), чеклист (19 пунктов), кластеризация, история |
| `seo_enrichments.py` | Schema.org, FAQ генерация, контентные пробелы |
| `og.py` | OG аудит, генерация, экспорт HTML |
| `mediaplan.py` | медиаплан (GET/PUT/reset) |
| `analytics.py` | Яндекс Метрика + ROI-калькулятор + аномалии трафика |
| `topvisor.py` | link, позиции, снимки выдачи (конкуренты) |
| `content_plan.py` | контент-план (CRUD статей) |
| `utm.py` | UTM-шаблоны (CRUD + генерация URL) |
| `portal.py` | клиентский портал (токены + публичные эндпоинты) |
| `export.py` | скачивание файлов (XLS, XLSX, DOCX, MD, HTML) |
| `reports.py` | автоотчёт клиенту (HTML preview + download + ручной запуск) |
| `settings.py` | API-ключи, параметры парсера/ИИ (admin only) |
| `users.py` | CRUD пользователей (admin only) |
| `history.py` | лог событий по проекту |
| `tasks.py` | статус Celery-задач |
| `push.py` | Web Push уведомления (subscribe/unsubscribe) |

---

## Модели БД (backend/app/models/)

### Основные модели

**`User`** — `id, login, email, password_hash, role (super_admin/admin/specialist/viewer), is_active, last_login`

**`Project`** — `id, name, client_name, url, specialist_id→User, budget, status, notes, topvisor_project_id, deleted_at`

**`Brief`** — `id, project_id, niche, products, price_segment, geo, target_audience, pains, usp, competitors_urls (JSON), campaign_goal, ad_geo, excluded_geo, monthly_budget, restrictions, raw_data (JSON)`

**`CrawlSession`** — `id, project_id, status (pending/running/done/failed), pages_total, pages_done, started_at, finished_at`

**`Page`** — `id, crawl_session_id, url, status_code, title, description, h1, h1_count, h2_list (JSON), canonical, og_title, og_description, og_image, og_type, robots_meta, word_count, internal_links (JSON), external_links (JSON), images_without_alt, load_time_ms, priority, redirect_chain (JSON), cwv_lcp, cwv_cls, cwv_fid`

**`Campaign`** — `id, project_id, name, type, priority, status, geo (JSON), budget_monthly, sitelinks (JSON), strategy_text`

**`AdGroup`** — `id, campaign_id, name, status`

**`Keyword`** — `id, ad_group_id, phrase, frequency, frequency_updated_at, temperature (hot/warm/cold), status, match_type`

**`NegativeKeyword`** — `id, project_id, campaign_id, phrase, block`

**`Ad`** — `id, ad_group_id, headline1/2/3 (56/30/30 chars), text (81 chars), display_url, utm, status (draft/ready/review/paused), variant`

**`SeoPageMeta`** — `id, project_id, page_url, rec_title, rec_description, rec_og_title, rec_og_description, twitter_card, twitter_title, twitter_description, schema_org_json, faq_json, manually_edited, generated_at`

**`MediaPlan`** — `id, project_id, rows (JSON), updated_at`
⚠️ Строки хранятся как JSON в одном поле `rows`, НЕ в отдельных записях БД.
Структура строки: `{month, month_name, pct, budget, forecast_clicks, forecast_leads, cpa}`

**`ContentPlanArticle`** — `id, project_id, title, target_keyword, cluster, intent, status (idea/outline/writing/review/published), priority, due_date, assigned_to, notes, url, word_count_target`

**`Task`** — `id, project_id, type, status (pending/running/success/failed), progress (0–100), celery_task_id, result (JSON), error, created_at, finished_at`

**`ProjectEvent`** — `id, project_id, user_id, user_login, event_type, description, created_at` — история действий

**`Setting`** — `id, key, value_encrypted` — API-ключи и настройки в зашифрованном виде (AES-256)

**`SystemPrompt`** — `id, name, prompt_text, module` — редактируемые системные промпты

### Новые модели (с версии 0009)

**`UtmTemplate`** — `id, project_id, name, source, medium, campaign, content, term`

**`SeoMetaHistory`** — `id, project_id, page_url, field_name, old_value, new_value, changed_by, changed_at` — история изменений мета-тегов

**`ProjectAccessToken`** — `id, project_id, token (unique), label, created_by, expires_at, is_active, created_at` — токены клиентского портала

---

## Миграции (alembic/versions/)

| Файл | Что делает |
|------|------------|
| `0001_initial.py` | Базовые таблицы: users, projects, briefs, crawl_sessions, pages, campaigns, ad_groups, keywords, negative_keywords, ads, tasks, settings |
| `0002_seo_meta.py` | Таблица seo_page_meta |
| `0003_mediaplan_history.py` | Таблицы media_plans, project_events |
| `0004_topvisor_project_id.py` | projects.topvisor_project_id |
| `0005_content_plan_push.py` | Таблицы content_plan_articles, push_subscriptions |
| `0006_campaign_sitelinks.py` | campaigns.sitelinks (JSON) |
| `0007_twitter_card.py` | seo_page_meta.twitter_card/title/description |
| `0008_page_h1_count.py` | pages.h1_count |
| `0009_new_features.py` | Таблицы: utm_templates, seo_meta_history, project_access_tokens. Колонки: seo_page_meta.schema_org_json/faq_json, pages.redirect_chain/cwv_lcp/cwv_cls/cwv_fid |
| `0010_add_indexes.py` | 25 индексов на FK и фильтруемые колонки (pages, campaigns, keywords, ads, tasks и др.) |
| `0011_soft_delete_projects.py` | projects.deleted_at (soft delete) + индекс |

Применять: `alembic upgrade head`

---

## Авторизация и роли

```python
# backend/app/auth/deps.py
CurrentUser        # любой авторизованный
NonViewerRequired  # specialist/admin/super_admin — блокирует viewer на write-операциях
AdminRequired      # admin/super_admin
SuperAdminRequired # только super_admin
```

**Роли:** `super_admin` → `admin` → `specialist` → `viewer` (только чтение, все POST/PUT/DELETE → 403)

Super admin создаётся из `.env`: `SUPER_ADMIN_LOGIN`, `SUPER_ADMIN_PASSWORD_HASH`.

---

## Внешние API

| Сервис | Файл | Используется для |
|--------|------|-----------------|
| Anthropic Claude | `services/claude.py` | Стратегия, ключи, объявления, мета-теги, OG, Schema.org, FAQ, Content Gap, анализ запросов |
| Яндекс Wordstat | `services/wordstat.py` | Частотности ключей, динамика по месяцам |
| Topvisor | `services/topvisor.py` | Кластеризация, позиции, снимки выдачи |
| Яндекс Метрика | `services/metrika.py` | Трафик, источники, цели, аномалии |
| Google PageSpeed | `services/pagespeed.py` | Core Web Vitals (LCP, CLS, FID) — бесплатно 25K/день |

Ключи хранятся зашифрованными в БД. Получать: `settings_service.get_api_key(db, service, key)`.

---

## Celery-задачи (backend/app/tasks/)

| Задача | Файл | Что делает |
|--------|------|------------|
| `task_crawl_site` | crawl.py | Парсинг сайта (robots.txt → sitemap → страницы) |
| `task_generate_strategy` | direct.py | Генерация стратегии Директа через Claude |
| `task_check_frequencies` | direct.py | Массовая проверка частот через Wordstat |
| `task_generate_keywords` | direct.py | Генерация ключей через Claude |
| `task_generate_ads` | direct.py | Генерация объявлений через Claude |
| `task_generate_negative_kw` | direct.py | Генерация минус-слов через Claude |
| `task_generate_seo_meta` | seo.py | Генерация title/description/OG через Claude (поддерживает page_urls, only_missing, only_issues) |
| `task_monthly_reports` | reports.py | Celery beat: 1-го числа каждого месяца генерирует отчёты по всем активным проектам |

---

## Эндпоинты по функциям

### Парсинг (`crawl.py`)
- `POST /projects/{id}/crawl/start` — запуск
- `GET /projects/{id}/crawl/status` — прогресс
- `GET /projects/{id}/crawl/pages` — список страниц с фильтрами
- `GET /projects/{id}/crawl/report` — сводка проблем
- `GET /projects/{id}/crawl/tree` — дерево URL
- `GET /projects/{id}/crawl/linking` — анализ внутренней перелинковки (сироты, хабы, изолированные)
- `GET /projects/{id}/crawl/redirects` — цепочки редиректов с severity (1/2/3+ хопов)
- `GET /projects/{id}/crawl/robots-audit` — аудит robots.txt + sitemap
- `POST /projects/{id}/crawl/cwv` — Core Web Vitals через Google PageSpeed API

### Яндекс Директ (`direct.py` + `direct_analysis.py`)
- `POST/GET/PUT /projects/{id}/direct/strategy` — стратегия
- `GET/POST /projects/{id}/direct/campaigns` — кампании
- `PATCH/DELETE /direct/campaigns/{id}` — изменение/удаление
- `GET/POST /direct/campaigns/{id}/groups` — группы объявлений
- `GET/POST/DELETE /direct/groups/{id}/keywords` — ключи
- `POST /direct/groups/{id}/keywords/generate` — генерация ключей (Claude)
- `POST /direct/groups/{id}/keywords/check-frequency` — частоты (Wordstat)
- `GET /direct/keywords/dynamics` — динамика по 12 месяцам
- `GET/POST/PATCH/DELETE /direct/groups/{id}/ads` — объявления
- `POST /direct/groups/{id}/ads/generate` — генерация объявлений (Claude)
- `POST /direct/ads/{id}/mark-winner` — назначить победителя A/B теста
- `GET/POST/DELETE /projects/{id}/direct/negative-keywords` — минус-слова
- `POST /projects/{id}/direct/negative-keywords/generate` — генерация (Claude)
- `GET /projects/{id}/direct/ngrams?n=2&min_count=3` — N-грамм анализ
- `GET /projects/{id}/direct/keywords/heatmap` — тепловая карта (температура × частота)
- `GET /projects/{id}/direct/ads/ab-stats` — A/B сравнение вариантов
- `POST /projects/{id}/direct/analyze-search-queries` — анализ поисковых запросов → минус-слова
- `POST /projects/{id}/direct/keywords/cluster-local` — локальная кластеризация (pymorphy2)

### SEO (`seo.py` + `seo_enrichments.py`)
- `GET /projects/{id}/seo/pages` — страницы с мета-проблемами
- `PATCH /projects/{id}/seo/meta` — обновление мета (автоматически пишет в историю)
- `POST /projects/{id}/seo/generate-meta` — генерация мета batch (+ `page_urls`, `only_missing`, `only_issues`)
- `GET /projects/{id}/seo/checklist` — SEO чеклист 19 пунктов
- `POST /projects/{id}/seo/cluster` — кластеризация ключей (Topvisor)
- `GET /projects/{id}/seo/meta-history?page_url=...` — история изменений мета
- `POST /projects/{id}/seo/schema/generate` — генерация Schema.org JSON-LD (Claude)
- `GET /projects/{id}/seo/schema?page_url=...` — сохранённый Schema.org
- `POST /projects/{id}/seo/faq/generate` — генерация FAQ + FAQPage JSON-LD (Claude)
- `GET /projects/{id}/seo/faq?page_url=...` — сохранённый FAQ
- `POST /projects/{id}/seo/content-gap` — контентные пробелы vs конкуренты (краулинг + Claude)

### Аналитика (`analytics.py`)
- `GET /projects/{id}/analytics/counters` — список счётчиков Метрики
- `POST/GET /projects/{id}/analytics/counter` — привязка счётчика
- `GET /projects/{id}/analytics/summary` — сводка трафика
- `GET /projects/{id}/analytics/goals` — цели конверсии
- `GET /projects/{id}/analytics/roi` — ROI-калькулятор (медиаплан + факт из Метрики)
- `GET /projects/{id}/analytics/anomalies` — аномалии трафика (±15%/±30% за 7 дней)

### Клиентский портал (`portal.py`)
- `POST /projects/{id}/portal/tokens` — создать токен доступа
- `GET /projects/{id}/portal/tokens` — список токенов
- `DELETE /projects/{id}/portal/tokens/{id}` — отозвать токен
- `GET /portal/{token}` — обзор проекта (публичный, без авторизации)
- `GET /portal/{token}/positions` — позиции Topvisor
- `GET /portal/{token}/analytics` — сводка Метрики
- `GET /portal/{token}/mediaplan` — медиаплан
- `GET /portal/{token}/report` — HTML-отчёт

### UTM-конструктор (`utm.py`)
- `GET /projects/{id}/utm-templates` — список шаблонов
- `POST /projects/{id}/utm-templates` — создать шаблон
- `DELETE /projects/{id}/utm-templates/{tid}` — удалить
- `POST /projects/{id}/utm-templates/build` — сгенерировать UTM-ссылку

### Проекты
- `POST /projects/{id}/duplicate` — дублирование проекта (копирует бриф + кампании/группы)

### Отчёты
- `GET /projects/{id}/report/html` — скачать HTML-отчёт
- `GET /projects/{id}/report/preview` — просмотр в браузере
- `POST /projects/{id}/report/generate` — ручной запуск генерации

---

## SEO чеклист (19 пунктов)

**Мета-теги:** без title, короткий/длинный title, дублирующийся title, без description, короткое/длинное/дублирующееся description

**Структура:** без H1, несколько H1, noindex, без canonical

**Производительность:** медленные страницы (>3с)

**Изображения:** без alt

**OpenGraph:** без og:title, og:description, og:image

**Ошибки:** 4xx, 5xx

---

## Фронтенд — структура

### Вкладки ProjectPage

`overview | brief | crawl | direct | seo | og | mediaplan | analytics | topvisor | content-plan | reports | history | export | utm`

После рефакторинга каждая вкладка — отдельный файл в `frontend/src/pages/tabs/`:

| Файл | Содержит |
|------|---------|
| `CrawlTab.tsx` | LinkingSection, RedirectsSection, RobotsAuditSection, CwvSection |
| `DirectTab.tsx` | NgramsSection, HeatmapSection, AbSection, SearchQueriesModal, LocalClusterSection |
| `SeoTab.tsx` | SchemaSection, FaqSection, ContentGapSection, MetaHistoryModal |
| `AnalyticsTab.tsx` | AnomalyBanner, RoiSection |
| `ReportsTab.tsx` | ClientPortalSection |
| `UtmTab.tsx` | UTM-конструктор (новая вкладка) |

### Публичный портал

`frontend/src/pages/PortalPage.tsx` — страница `/portal/:token` без авторизации.
Вкладки: Позиции | Аналитика | Медиаплан | Отчёт.

### API-модули (`frontend/src/api/`)

| Файл | Что экспортирует |
|------|-----------------|
| `auth.ts` | `login`, `getMe` |
| `projects.ts` | `projectsApi` (CRUD + duplicate) |
| `direct.ts` | `directApi` (кампании, группы, ключи, объявления, анализ) |
| `seo.ts` | `seoApi` (мета, чеклист, schema.org, FAQ, content gap, история) |
| `og.ts` | `ogApi` (аудит, генерация, экспорт) |
| `mediaplan.ts` | `mediaplanApi` |
| `analytics.ts` | `analyticsApi` (Метрика + ROI + аномалии) |
| `crawl.ts` | `crawlApi` (перелинковка, редиректы, robots, CWV) |
| `utm.ts` | `utmApi` (шаблоны + сборка URL) |
| `portal.ts` | `portalApi` (токены) |
| `settings.ts` | `settingsApi` (настройки, пользователи, промпты) |
| `client.ts` | Axios-инстанс с инжектом токена + автоматический refresh при 401 |

---

## Паттерны кода

### Backend — новый эндпоинт

```python
from app.auth.deps import CurrentUser, NonViewerRequired

def _check_project_access(project_id: uuid.UUID, current_user, db: Session) -> Project:
    """Стандартная проверка доступа — копировать в каждый роутер."""
    project = db.get(Project, project_id)
    if not project or project.deleted_at is not None:  # ← soft delete обязателен!
        raise HTTPException(status_code=404, detail="Project not found")
    if current_user.role == UserRole.SPECIALIST and project.specialist_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return project

@router.post("/projects/{project_id}/something", status_code=201)
def do_something(
    project_id: uuid.UUID,
    body: SomeSchema,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],  # только для write-операций
    db: Annotated[Session, Depends(get_db)],
):
    _check_project_access(project_id, current_user, db)
    ...
```

> **Важно:** Всегда проверяй `project.deleted_at is not None` при доступе к проекту. Не используй `db.get(Project, id)` без этой проверки.

### Backend — новая миграция

Файл: `backend/alembic/versions/NNNN_description.py`
`revision = "NNNN"`, `down_revision = "NNNN-1"` (последняя — `"0011"`)

### Frontend — новый API-запрос

```typescript
// src/api/something.ts
import { api } from './client'
export const somethingApi = {
  get: (projectId: string) => api.get(`/projects/${projectId}/something`).then(r => r.data),
}

// В компоненте:
const { data } = useQuery({ queryKey: ['something', projectId], queryFn: () => somethingApi.get(projectId) })
const mutation = useMutation({ mutationFn: ..., onSuccess: () => qc.invalidateQueries(...) })
```

### Frontend — новая вкладка

1. Создать `frontend/src/pages/tabs/NewTab.tsx` с `export default function NewTab({ projectId })`
2. Импортировать в `ProjectPage.tsx`
3. Добавить в тип `Tab` и в JSX switch-блок вкладок

---

## Переменные окружения (.env)

```bash
SUPER_ADMIN_LOGIN=admin
SUPER_ADMIN_PASSWORD_HASH=$$2b$$12$$...   # ⚠️ Каждый $ удваивается → $$ для docker-compose!
SUPER_ADMIN_EMAIL=admin@company.ru

# БД — ОБЯЗАТЕЛЬНО сменить пароль!
DATABASE_URL=postgresql+psycopg://seodirect:CHANGE_ME@postgres:5432/seodirect
POSTGRES_USER=seodirect
POSTGRES_PASSWORD=CHANGE_ME           # используется docker-compose
POSTGRES_DB=seodirect

# Redis — ОБЯЗАТЕЛЬНО задать пароль!
REDIS_PASSWORD=CHANGE_ME
REDIS_URL=redis://:CHANGE_ME@redis:6379/0

SECRET_KEY=64-char-random             # python -c "import secrets; print(secrets.token_hex(32))"
ENCRYPTION_KEY=32-char-random         # python -c "import secrets; print(secrets.token_hex(16))"

# JWT
JWT_ALGORITHM=HS256
ACCESS_TOKEN_MINUTES=15
REFRESH_TOKEN_DAYS=30
REFRESH_TOKEN_REMEMBER_DAYS=90

# Rate limiting
LOGIN_RATE_LIMIT_ATTEMPTS=5
LOGIN_RATE_LIMIT_WINDOW_SECONDS=900

# Парсер
CRAWL_DELAY_MS_DEFAULT=1000
CRAWL_TIMEOUT_SECONDS=10
CRAWL_MAX_PAGES=500
CRAWL_USER_AGENT=SEODirectBot/1.0 (internal)
CRAWL_RESPECT_ROBOTS=true

# Приложение
APP_ENV=production
FRONTEND_URL=https://yourdomain.ru
LOG_LEVEL=INFO

# API ключи (можно задать здесь или через веб-настройки)
ANTHROPIC_API_KEY=sk-ant-...
WORDSTAT_OAUTH_TOKEN=
TOPVISOR_API_KEY=
METRIKA_OAUTH_TOKEN=
DIRECT_OAUTH_TOKEN=
DIRECT_CLIENT_LOGIN=
GOOGLE_PAGESPEED_API_KEY=             # опционально, без него 25K/день бесплатно
```

---

## Observability и безопасность

### Health checks

| Эндпоинт | Тип | Что проверяет |
|-----------|-----|---------------|
| `GET /api/health` | Liveness | Процесс запущен |
| `GET /api/ready` | Readiness | БД + Redis + Celery workers |
| `GET /api/metrics` | Prometheus | Счётчики запросов, латентность (только внутренние IP — nginx ACL + проверка на уровне приложения) |

### Security headers

Два уровня защиты:

**nginx** (основной): `HSTS` (max-age=2y, includeSubDomains, preload), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `X-XSS-Protection: 0`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, microphone, geolocation, usb, payment, interest-cohort), `CSP` (default-src 'self', frame-ancestors 'none').

**observability.py** (бэкап): дублирует основные заголовки для запросов, минующих nginx.

### Rate limiting

- Login: 5 попыток / 15 мин (по IP + по логину, берётся MAX)
- Генерация (Claude API): 10 запросов / мин на эндпоинт (все `generate` и `content-gap`)
- nginx: общий `10r/s` burst=20 на `/api/`, `5r/m` burst=3 на `/api/auth/login`
- Реализация: `slowapi` + Redis (бэкенд), `limit_req` (nginx)

### Шифрование и токены

- API-ключи: AES-256-GCM, хранятся в таблице `settings` (`auth/encryption.py`)
- Пароли: bcrypt (`auth/security.py`)
- JWT: HS256/384/512, access 15 мин + refresh 30 дней (90 дней с remember me)
- Refresh-токены: jti-blacklist + per-user generation counter в Redis + rotation при каждом refresh
- `POST /auth/logout` — отзыв refresh-токена (фронтенд вызывает автоматически)
- Фронтенд: автоматический refresh при 401 с очередью запросов (`api/client.ts`)
- Автоинвалидация при: деактивации, смене роли, сбросе пароля
- Timing-safe login (dummy hash при несуществующем пользователе)

### SSRF-защита

- `crawl/crawler.py` — `_is_private_or_reserved()` блокирует приватные/зарезервированные IP через DNS resolution (включая sitemap URL из robots.txt)
- `seo_enrichments.py` — `_is_safe_url()` в content gap анализе блокирует internal IP, metadata endpoints, unsafe redirects

### Soft delete

Проекты не удаляются физически. `DELETE /projects/{id}` устанавливает `deleted_at`. Все запросы фильтруют `deleted_at IS NULL`.

### Бэкапы

`scripts/backup_db.sh` — pg_dump + gzip + ротация 30 дней. Запускать через cron.

---

## Технический долг

Низкоприоритетные задачи. Все critical/high закрыты.

| Проблема | Файл | Приоритет |
|----------|------|-----------|
| SHA256 → PBKDF2 для encryption key (нужна data migration — re-encrypt settings) | `auth/encryption.py` | Medium |
| Content-gap rate limit 5/min, но 50+ outbound HTTP на запрос | `seo_enrichments.py` | Medium |
| DLQ мониторинг (Celery Flower или sweep task) | `celery_app.py` | Medium |
| N+1 в duplicate_project (группы в цикле по кампаниям) | `projects.py:384` | Medium |
| duplicate_project без единой транзакции | `projects.py:334` | Medium |
| ondelete CASCADE на FK Project→User | миграция | Medium |
| Axios: retry transient errors (429, 5xx) | `api/client.ts` | Medium |
| Rate limiter fallback на IP для аутентифицированных | `limiter.py` | Low |
| Migration 0005: nullable created_at/updated_at | `0005_content_plan_push.py` | Low |
| CHECK constraints (frequency >= 0, load_time_ms >= 0) | models | Low |
| TypeScript: noUnusedLocals/noUnusedParameters=true | `tsconfig.json` | Low |
| React Query: global error handler | `main.tsx` | Low |
| setup_server.sh: хардкод домена/IP | `scripts/setup_server.sh` | Low |
| Crawl task inner exception может проглотить ошибку | `tasks/crawl.py:123` | Low |

---

## Запуск (Docker)

### Development

```bash
cp .env.example .env
# ОБЯЗАТЕЛЬНО: задать POSTGRES_PASSWORD, REDIS_PASSWORD, SECRET_KEY, ENCRYPTION_KEY
docker-compose up -d
docker-compose exec backend alembic upgrade head
docker-compose exec backend python init_superadmin.py
```

Доступ: `http://localhost` (через nginx) или `http://localhost:8000/api/docs` (напрямую, только dev).
Backend и frontend привязаны к `127.0.0.1` — не доступны извне.

### Production

```bash
cp .env.example .env
# ОБЯЗАТЕЛЬНО: сменить ВСЕ пароли и ключи, установить FRONTEND_URL, APP_ENV=production
docker-compose -f docker-compose.prod.yml up -d
docker-compose -f docker-compose.prod.yml exec backend alembic upgrade head
```

Prod-отличия: нет volume mounts, нет `--reload`, нет exposed портов (только nginx 80/443), Redis с `--requirepass` (256MB), backend 1GB + 2 workers, Celery 1.5GB + 4 воркера, healthchecks на всех сервисах, SSL через nginx.

### Обновление

```bash
git pull && docker-compose up -d --build
docker-compose exec backend alembic upgrade head
```

### Docker-файлы

| Файл | Назначение |
|------|------------|
| `docker-compose.yml` | Development: volume mounts, hot reload, localhost-only порты |
| `docker-compose.prod.yml` | Production: без volumes, без exposed портов, SSL, `--requirepass` обязателен |
| `.dockerignore` | Исключает `.env`, `.git`, `node_modules`, `scripts/` из образов |
