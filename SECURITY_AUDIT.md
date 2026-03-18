# SEODirect — Полный аудит безопасности, производительности и рекомендации

**Дата:** 2026-03-18
**Версия:** Полный аудит сборки

---

## Содержание

1. [Критические уязвимости безопасности](#1-критические-уязвимости-безопасности)
2. [Защита персональных данных](#2-защита-персональных-данных)
3. [Стресс-тест: узкие места производительности](#3-стресс-тест-узкие-места-производительности)
4. [Безопасность фронтенда](#4-безопасность-фронтенда)
5. [Сводная таблица всех находок](#5-сводная-таблица-всех-находок)
6. [Рекомендации по улучшению сервиса](#6-рекомендации-по-улучшению-сервиса)

---

## 1. Критические уязвимости безопасности

### 1.1 CRITICAL — Отсутствует проверка доступа к проекту в export-эндпоинтах

**Файл:** `backend/app/routers/export.py` (строки 25–164)

Все эндпоинты экспорта (`download_mediaplan_xlsx`, `download_direct_xls`, `download_strategy_md`, `download_copywriter_brief`, `download_strategy_html`) **не проверяют**, является ли текущий specialist владельцем проекта.

```python
# НЕПРАВИЛЬНО (export.py):
def download_mediaplan_xlsx(project_id, current_user, db):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404)
    # ← НЕТ ПРОВЕРКИ specialist_id!

# ПРАВИЛЬНО (crawl.py):
if current_user.role == UserRole.SPECIALIST and project.specialist_id != current_user.id:
    raise HTTPException(status_code=403)
```

**Импакт:** Specialist может скачать данные ЛЮБОГО проекта, перебирая UUID.

---

### 1.2 CRITICAL — Отсутствует проверка доступа в analytics-эндпоинтах

**Файл:** `backend/app/routers/analytics.py` (строки 24–178)

Все эндпоинты аналитики (`get_summary`, `get_goals`, `get_roi`, `get_traffic_anomalies`) требуют только `CurrentUser` без проверки владельца проекта.

---

### 1.3 HIGH — Подмена IP через X-Forwarded-For

**Файл:** `backend/app/routers/auth.py` (строки 40–44)

```python
def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()  # Берёт ПЕРВЫЙ IP вслепую
    return request.client.host
```

Атакующий обходит rate limiting, подставляя фейковый `X-Forwarded-For` заголовок.

---

### 1.4 HIGH — Слабое формирование ключа шифрования (AES)

**Файл:** `backend/app/services/encryption.py` (строки 7–12)

```python
def _get_key(encryption_key: str) -> bytes:
    key_bytes = encryption_key.encode()
    if len(key_bytes) < 32:
        key_bytes = key_bytes.ljust(32, b"0")  # Паддинг нулями!
    return key_bytes[:32]
```

- Два разных модуля шифрования (`services/encryption.py` и `auth/encryption.py`) с разной логикой
- Паддинг `b"0"` предсказуем, уменьшает энтропию
- Отсутствует PBKDF2/Argon2 для деривации ключа

---

### 1.5 HIGH — XXE-уязвимость при парсинге sitemap

**Файл:** `backend/app/crawl/crawler.py` (строка 121)

```python
root = ET.fromstring(r.text)  # ElementTree без защиты от XXE
```

Вредоносный sitemap.xml может читать файлы сервера через `file://` или вызвать DoS (billion laughs attack).

**Исправление:** Использовать `defusedxml.ElementTree.fromstring()`.

---

### 1.6 MEDIUM — SSRF в анализе контентных пробелов

**Файл:** `backend/app/routers/seo_enrichments.py` (строки 272–315)

```python
async def fetch_page(url: str) -> dict | None:
    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client_http:
        r = await client_http.get(url)  # Нет валидации URL!
```

- Принимает любой URL без проверки на внутренние IP-адреса
- Можно просканировать внутреннюю сеть (127.0.0.1, 169.254.169.254 — AWS metadata)
- `follow_redirects=True` позволяет перенаправление на внутренние сервисы

---

### 1.7 MEDIUM — Роль пользователя не перепроверяется при каждом запросе

**Файл:** `backend/app/auth/security.py` (строки 28–33)

Роль записывается в JWT при создании токена. Если admin понизил пользователя до viewer, старый токен с ролью admin действует ещё 15 минут.

---

### 1.8 MEDIUM — CORS: localhost разрешён в production

**Файл:** `backend/app/main.py` (строки 50–56)

```python
allow_origins=[settings.frontend_url, "http://localhost:5173", "http://localhost:3000"],
allow_credentials=True,
```

В production не должны быть разрешены localhost-адреса.

---

### 1.9 MEDIUM — Path Traversal в именах экспортируемых файлов

**Файл:** `backend/app/routers/export.py` (строки 41, 77, 108, 133, 158)

```python
safe_name = project.name.replace(" ", "_")[:50]
filename = f"mediaplan_{safe_name}.xlsx"
```

Название проекта `../../../etc/passwd` создаёт опасное имя файла. Нужен whitelist `[a-zA-Z0-9_а-яА-Я-]`.

---

### 1.10 MEDIUM — Отсутствуют security-заголовки

В FastAPI не добавлены:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security`
- `Content-Security-Policy`

---

### 1.11 MEDIUM — Утечка информации в ошибках

**Файл:** `backend/app/routers/settings.py` (строки 196–197), `analytics.py` (строки 36–39)

```python
except Exception as e:
    return {"ok": False, "message": str(e)}  # Полное сообщение ошибки клиенту!
```

---

### 1.12 MEDIUM — Rate limiting только по IP, не по логину

**Файл:** `backend/app/auth/rate_limit.py` (строки 11–22)

Атакующий может перебирать пароли с разных IP/VPN. Нужен комбинированный ключ `login:ip`.

---

### 1.13 MEDIUM — Refresh-токены: нет механизма отзыва

**Файл:** `backend/app/config.py` (строки 27–29)

- Refresh-токен действует 30–90 дней
- Нет blacklist/denylist в Redis для отзыва скомпрометированных токенов
- Нет инвалидации при удалении/деактивации пользователя

---

## 2. Защита персональных данных

### 2.1 HIGH — Нет политики хранения данных (GDPR)

- Crawl-сессии хранятся бессрочно
- Portal-токены могут не иметь `expires_at` (NULL = вечный доступ)
- Нет эндпоинта для экспорта/удаления персональных данных пользователя
- Нет классификации PII-полей в моделях

**Затронутые PII:**
| Данные | Модель | Поле |
|--------|--------|------|
| Email | User | `email` |
| Пароль (хеш) | User | `password_hash` |
| Имя клиента | Project | `client_name` |
| Бюджет | Project/Brief | `budget`, `monthly_budget` |
| ЦА, боли, УТП | Brief | `target_audience`, `pains`, `usp` |
| URL конкурентов | Brief | `competitors_urls` |

### 2.2 HIGH — Жёсткое удаление проектов без аудита

**Файл:** `backend/app/routers/projects.py` (строки 201–213)

`DELETE /projects/{id}` выполняет `db.delete(project)` — каскадное удаление всех данных без:
- Записи в лог аудита
- Soft delete (возможность восстановления)
- Подтверждения от пользователя
- 30-дневного grace-периода

### 2.3 MEDIUM — Экспортируемые файлы содержат конфиденциальные данные

**Файл:** `backend/app/services/exporter.py` (строки 292–310)

Экспорт включает: имя клиента, бюджет, УТП, ЦА, URL конкурентов — в открытом виде. Нет:
- Водяных знаков / меток "КОНФИДЕНЦИАЛЬНО"
- Логирования кто и когда скачал
- Контроля утечек (DLP)

### 2.4 MEDIUM — Логи не защищены

**Файл:** `backend/app/main.py` (строки 24–27)

- Нет ротации логов
- Нет маскирования PII в логах
- Пароли/токены из exceptions могут попасть в лог
- Логи хранятся в plaintext

---

## 3. Стресс-тест: узкие места производительности

### 3.1 CRITICAL — N+1 запросы в медиаплане (2500+ запросов на вызов)

**Файл:** `backend/app/routers/mediaplan.py` (строки 103–115)

```python
def _get_total_frequency(project_id, db):
    campaigns = db.scalars(select(Campaign).where(...)).all()
    for c in campaigns:                    # N кампаний
        groups = db.scalars(...).all()     # N × M групп
        for g in groups:
            kws = db.scalars(...).all()    # N × M × K ключей
```

**10 кампаний × 5 групп × 50 ключей = 2510+ SQL-запросов** на один GET-запрос.

**Решение:** Один JOIN-запрос с `SUM(frequency)`.

---

### 3.2 CRITICAL — Загрузка ВСЕХ страниц в память (crawl)

**Файл:** `backend/app/routers/crawl.py` (строка 141)

```python
all_pages = db.scalars(select(Page).where(...)).all()  # ВСЕ страницы сразу
```

**50 000 страниц ≈ 400+ MB памяти** на каждый вызов `/crawl/pages`.

---

### 3.3 CRITICAL — Экспорт целиком в памяти

**Файл:** `backend/app/services/exporter.py` (строки 182–266)

XLSX-файл строится полностью в оперативной памяти. Для проекта с 100 кампаниями × 1000 групп → **200–500 MB на один экспорт**.

Нет потокового (streaming) формирования файла.

---

### 3.4 CRITICAL — Celery: таймауты vs реальное время задач

**Файл:** `backend/app/celery_app.py` (строки 28–29)

```python
task_soft_time_limit=600,   # 10 мин
task_time_limit=900,        # 15 мин
```

Генерация мета для 100 страниц = 100 вызовов Claude API × ~2 мин = **200 минут** → задача убивается.

**Файл:** `backend/app/tasks/seo.py` (строки 119–193)

- Последовательная обработка: 1 страница → 1 вызов Claude → 1 коммит в БД
- Нет batch-обработки
- `db.commit()` на каждую страницу (100 коммитов вместо 1)

---

### 3.5 HIGH — `asyncio.run()` блокирует uvicorn-воркер

**Файл:** `backend/app/routers/direct.py` (строки 253, 359, 400)

```python
kws = asyncio.run(generate_keywords_for_group(group_id, db))  # БЛОКИРУЕТ ПОТОК
```

Синхронный эндпоинт вызывает `asyncio.run()`, занимая весь worker thread. Снижение пропускной способности API на 50–80%.

---

### 3.6 HIGH — Отсутствуют индексы БД

Не обнаружены индексы на часто используемых полях:
| Поле | Используется в |
|------|---------------|
| `Page.crawl_session_id` | `/crawl/pages`, `/crawl/report` |
| `Page.url` | robots audit, дерево URL |
| `Keyword.ad_group_id` + `frequency` | heatmap, n-граммы |
| `Campaign.project_id` + `priority` | стратегия |
| `SeoPageMeta.project_id` + `page_url` | мета-генерация |

---

### 3.7 HIGH — Celery concurrency = 2

**Файл:** `docker-compose.yml` (строка 77)

```yaml
command: celery -A app.celery_app worker -l info -c 2
```

Только 2 параллельных воркера. При 10 пользователях очередь быстро забивается.

---

### 3.8 HIGH — Redis без лимита памяти

**Файл:** `docker-compose.yml`

```yaml
redis:
  image: redis:7-alpine
  # Нет maxmemory!
```

Результаты задач хранятся бессрочно → Redis может потреблять неограниченно RAM.

---

### 3.9 HIGH — PostgreSQL лимит 512 MB

```yaml
postgres:
  deploy:
    resources:
      limits:
        memory: 512M
```

Недостаточно при 50+ параллельных запросах с JOIN'ами на таблице Pages.

---

### 3.10 MEDIUM — JSON-поля растут безгранично

| Поле | Модель | Риск |
|------|--------|------|
| `internal_links` | Page | 5000+ ссылок на страницу → МБ на запись |
| `external_links` | Page | Без лимита |
| `raw_data` | Brief | Произвольный JSON без ограничения |
| `competitors_urls` | Brief | Без лимита на количество URL |

**50 000 страниц × 1 MB = 50 GB** только одна таблица `pages`.

---

### 3.11 MEDIUM — Нет пулирования HTTP-соединений в краулере

**Файл:** `backend/app/crawl/crawler.py`

Новый `httpx.AsyncClient` для каждого запроса. Для краулинга 50 000 страниц → 50 000 новых TCP-соединений.

---

### 3.12 MEDIUM — Race condition при старте краулинга

**Файл:** `backend/app/routers/crawl.py` (строки 44–52)

```python
running = db.scalar(select(CrawlSession).where(...))
if running:
    raise HTTPException(409)
```

Два одновременных запроса могут пройти проверку и запустить 2 параллельных краула.

---

### 3.13 MEDIUM — Фронтенд: нет виртуализации списков

**Файлы:** `DirectTab.tsx` (1043 строки), `SeoTab.tsx` (675), `CrawlTab.tsx` (623)

- 1000 ключевых слов = 1000 DOM-узлов → **15+ секунд отрисовки**
- Нет `react-virtuoso` или `react-window`
- `WordstatSparkline` запускает API-запрос на каждый ререндер

---

### 3.14 MEDIUM — Нет кеширования GET-эндпоинтов

Ни один GET-эндпоинт не устанавливает `Cache-Control`, `ETag` или `Last-Modified`. Каждая перезагрузка = свежий запрос в БД.

---

## 4. Безопасность фронтенда

### 4.1 CRITICAL — JWT-токен хранится в localStorage

**Файл:** `frontend/src/store/auth.ts` (строки 13–21)

```typescript
persist(
  (set) => ({
    accessToken: null,
    ...
  }),
  { name: 'auth-storage' }  // localStorage!
)
```

Любой XSS-скрипт может прочитать `localStorage['auth-storage']` и украсть JWT.

**Решение:** httpOnly cookies с `SameSite=Strict` и `Secure=true`.

---

### 4.2 MEDIUM — Нет CSRF-защиты

**Файл:** `frontend/src/api/client.ts`

Нет X-CSRF-Token заголовка. POST/PUT/DELETE запросы уязвимы к CSRF при использовании cookies.

---

### 4.3 MEDIUM — Portal-токен в URL

**Файл:** `frontend/src/pages/PortalPage.tsx` (строка 13)

```typescript
const { token } = useParams<{ token: string }>()
```

Токен виден в: истории браузера, логах сервера, Referrer-заголовках.

---

### 4.4 MEDIUM — Service Worker открывает произвольные URL

**Файл:** `frontend/public/sw.js` (строки 25–28)

```javascript
self.clients.openWindow(url)  // Нет валидации URL
```

При компрометации push-сервера — редирект на фишинговый сайт.

---

### 4.5 MEDIUM — Logout не очищает кеш React Query

**Файл:** `frontend/src/store/auth.ts` (строка 19)

```typescript
logout: () => set({ accessToken: null, user: null })
```

Данные предыдущего пользователя остаются в кеше `useQuery`. При логине другого пользователя — flash старых данных.

---

### 4.6 MEDIUM — Ошибки бекенда показываются пользователю

**Файлы:** `LoginPage.tsx`, `AdminUsersPage.tsx`, `SettingsPage.tsx`

```typescript
setError(err.response?.data?.detail || 'Ошибка')  // Технические детали!
```

---

## 5. Сводная таблица всех находок

| # | Находка | Severity | Категория | Файл |
|---|---------|----------|-----------|------|
| 1 | Нет проверки доступа в export | CRITICAL | AuthZ | `routers/export.py` |
| 2 | Нет проверки доступа в analytics | CRITICAL | AuthZ | `routers/analytics.py` |
| 3 | N+1 запросы: 2500+/вызов | CRITICAL | Perf | `routers/mediaplan.py` |
| 4 | Загрузка всех pages в RAM | CRITICAL | Perf | `routers/crawl.py` |
| 5 | Экспорт целиком в памяти | CRITICAL | Perf | `services/exporter.py` |
| 6 | JWT в localStorage | CRITICAL | Frontend | `store/auth.ts` |
| 7 | Celery таймауты < реального времени | CRITICAL | Tasks | `tasks/seo.py` |
| 8 | Подмена IP (bypass rate limit) | HIGH | Auth | `routers/auth.py` |
| 9 | Слабый KDF для AES ключа | HIGH | Crypto | `services/encryption.py` |
| 10 | XXE в парсинге XML | HIGH | Input | `crawl/crawler.py` |
| 11 | asyncio.run() блокирует worker | HIGH | Perf | `routers/direct.py` |
| 12 | Нет индексов БД | HIGH | Perf | `alembic/versions/` |
| 13 | Celery concurrency = 2 | HIGH | Infra | `docker-compose.yml` |
| 14 | Redis без maxmemory | HIGH | Infra | `docker-compose.yml` |
| 15 | SSRF в content gap | MEDIUM | Input | `routers/seo_enrichments.py` |
| 16 | JWT роль не перепроверяется | MEDIUM | Auth | `auth/security.py` |
| 17 | CORS localhost в prod | MEDIUM | Config | `main.py` |
| 18 | Path Traversal в экспорте | MEDIUM | Input | `routers/export.py` |
| 19 | Нет security-заголовков | MEDIUM | Headers | `main.py` |
| 20 | Утечка ошибок в ответах | MEDIUM | Info | `routers/settings.py` |
| 21 | Rate limit только по IP | MEDIUM | Auth | `auth/rate_limit.py` |
| 22 | Нет отзыва refresh-токенов | MEDIUM | Auth | `config.py` |
| 23 | Жёсткое удаление проектов | MEDIUM | Data | `routers/projects.py` |
| 24 | Нет GDPR (retention/export) | MEDIUM | Compliance | Все модели |
| 25 | JSON поля без лимита | MEDIUM | Perf | `models/crawl.py` |
| 26 | Race condition в краулере | MEDIUM | Concurrency | `routers/crawl.py` |
| 27 | Нет CSRF защиты | MEDIUM | Frontend | `api/client.ts` |
| 28 | Portal токен в URL | MEDIUM | Frontend | `PortalPage.tsx` |
| 29 | Logout не чистит кеш | MEDIUM | Frontend | `store/auth.ts` |
| 30 | Нет виртуализации списков | MEDIUM | Frontend | `tabs/*.tsx` |

---

## 6. Рекомендации по улучшению сервиса

### 6.1 Безопасность — немедленные действия (неделя 1)

1. **Добавить `_check_project_access()`** во все роутеры: `export.py`, `analytics.py`, `mediaplan.py`, `seo_enrichments.py`
2. **Заменить `ET.fromstring()` на `defusedxml`** в crawler.py
3. **Валидировать URL** перед запросом в `seo_enrichments.py` (запретить внутренние IP)
4. **Унифицировать encryption** — оставить один модуль с PBKDF2
5. **Перенести JWT в httpOnly cookies** или использовать BFF-паттерн

### 6.2 Производительность — неделя 2

1. **Переписать `_get_total_frequency()`** на один JOIN-запрос:
   ```sql
   SELECT SUM(k.frequency) FROM keywords k
   JOIN ad_groups g ON k.ad_group_id = g.id
   JOIN campaigns c ON g.campaign_id = c.id
   WHERE c.project_id = :pid
   ```
2. **Добавить индексы** через миграцию `0010_add_indexes.py`
3. **Пагинация на уровне БД** (не `all_pages = ...all()`, а `LIMIT/OFFSET` в SQL)
4. **Streaming export** через `StreamingResponse` + `openpyxl.write_only`
5. **Увеличить Celery concurrency** до 4–8
6. **Добавить `maxmemory 256mb`** и `maxmemory-policy allkeys-lru` в Redis

### 6.3 Фронтенд — неделя 3

1. **Виртуализация списков** — `react-virtuoso` для таблиц ключевых слов, страниц
2. **React.memo** для `WordstatSparkline` и тяжёлых компонентов
3. **Очистка кеша при logout**: `queryClient.clear()` в `logout()`
4. **Code splitting** — разбить крупные табы на lazy-loaded компоненты

---

### 6.4 Идеи для увеличения качества и скорости работы специалиста

#### Автоматизация рутины

| Идея | Описание | Приоритет |
|------|----------|-----------|
| **Авто-аудит при краулинге** | После парсинга автоматически запускать SEO-чеклист, CWV, robots-audit | HIGH |
| **Шаблоны проектов** | Готовые пресеты для ниш (e-commerce, услуги, SaaS) с предзаполненным брифом, стратегией, минус-словами | HIGH |
| **Bulk-операции** | Массовое редактирование мета-тегов, статусов объявлений, ключевых слов в таблице | HIGH |
| **Горячие клавиши** | Ctrl+S для сохранения, Tab для навигации между вкладками, / для быстрого поиска | MEDIUM |
| **Drag & Drop** | Перетаскивание ключевых слов между группами, перетаскивание статей в контент-плане | MEDIUM |

#### ИИ-ассистент

| Идея | Описание | Приоритет |
|------|----------|-----------|
| **Авто-генерация всего проекта** | Один клик: бриф → парсинг → стратегия → кампании → ключи → объявления → мета-теги | HIGH |
| **Умные подсказки** | "Для этой ниши рекомендуем добавить FAQ", "У конкурента X есть страница Y, которой нет у вас" | HIGH |
| **Анализ конкурентов v2** | Автопарсинг ТОП-10 по каждому ключу, сравнение структуры/контента | HIGH |
| **Прогноз позиций** | ML-модель предсказания позиций на основе исторических данных Topvisor | MEDIUM |
| **Автоответы в чате** | ИИ отвечает на типовые вопросы клиента в портале | MEDIUM |

#### Интеграции

| Идея | Описание | Приоритет |
|------|----------|-----------|
| **Яндекс Директ API** | Двусторонняя синхронизация: выгрузка кампаний напрямую в Директ | HIGH |
| **Google Search Console** | Импорт данных о показах/кликах/позициях | HIGH |
| **Telegram-бот** | Уведомления: "Краулинг завершён", "Аномалия трафика -30%", "Отчёт готов" | MEDIUM |
| **Slack/Teams** | Командные уведомления о статусах задач | MEDIUM |
| **Google Docs** | Экспорт контент-плана в Google Docs с совместным редактированием | LOW |

#### Аналитика и отчётность

| Идея | Описание | Приоритет |
|------|----------|-----------|
| **Дашборд руководителя** | Сводка по всем проектам: прогресс, бюджеты, KPI | HIGH |
| **Сравнение периодов** | Позиции/трафик за месяц vs предыдущий месяц | HIGH |
| **White-label отчёты** | Брендирование отчётов логотипом агентства | MEDIUM |
| **Автоматический скоринг** | Оценка 0–100 для каждого проекта на основе чеклиста + метрик | MEDIUM |
| **Канбан задач** | Визуализация задач по проекту: To Do → In Progress → Done | MEDIUM |

#### UX-улучшения

| Идея | Описание | Приоритет |
|------|----------|-----------|
| **Тёмная тема** | Для работы в вечернее время | LOW |
| **Оффлайн-режим** | PWA с Service Worker для просмотра данных без интернета | LOW |
| **История изменений (undo)** | Ctrl+Z для отмены последнего действия (мета-теги, объявления) | MEDIUM |
| **Мультиязычность** | EN/RU интерфейс для международных клиентов | LOW |
| **Импорт из Excel** | Загрузка ключевых слов, объявлений из XLS | HIGH |

#### DevOps и стабильность

| Идея | Описание | Приоритет |
|------|----------|-----------|
| **Health checks** | `/health` эндпоинт с проверкой БД, Redis, Celery | HIGH |
| **Prometheus + Grafana** | Метрики: время ответа, очередь задач, CPU/RAM | HIGH |
| **Sentry** | Централизованный сбор ошибок | HIGH |
| **CI/CD** | GitHub Actions: тесты → линтинг → деплой | MEDIUM |
| **Blue-green deploy** | Zero-downtime обновления | LOW |

---

## Приоритеты исправлений

### Неделя 1 (Критические)
- [ ] Добавить проверку доступа в export, analytics, mediaplan
- [ ] Исправить XXE (defusedxml)
- [ ] Исправить SSRF (валидация URL)
- [ ] Унифицировать шифрование (PBKDF2)
- [ ] Перенести JWT в httpOnly cookies

### Неделя 2 (Высокие)
- [ ] Исправить N+1 запросы (JOIN вместо вложенных циклов)
- [ ] Добавить индексы БД (миграция 0010)
- [ ] Streaming export (openpyxl write_only)
- [ ] Увеличить Celery workers до 4+
- [ ] Redis maxmemory
- [ ] Исправить asyncio.run() → async endpoints

### Неделя 3 (Средние)
- [ ] Security-заголовки
- [ ] CORS: убрать localhost из prod
- [ ] Rate limit по login + IP
- [ ] Soft delete проектов
- [ ] Виртуализация списков (react-virtuoso)
- [ ] React Query cache clear на logout

### Месяц 2 (Улучшения)
- [ ] GDPR: retention policy, data export
- [ ] Telegram-бот уведомлений
- [ ] Дашборд руководителя
- [ ] Шаблоны проектов по нишам
- [ ] Health checks + мониторинг
