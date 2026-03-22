"""Brief templates by niche — DB-driven with hardcoded defaults."""
import json
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser, require_roles
from app.db.session import get_db
from app.models.user import UserRole
from app.services.settings_service import get_setting, set_setting

logger = logging.getLogger(__name__)

router = APIRouter()
AdminDep = require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)

DEFAULT_TEMPLATES = [
    {
        "id": "ecommerce",
        "name": "Интернет-магазин",
        "icon": "🛒",
        "data": {
            "niche": "Интернет-магазин / e-commerce",
            "price_segment": "middle",
            "campaign_goal": "sales",
            "target_audience": "Покупатели 25–45 лет, ищущие товары онлайн, ценят скорость доставки и удобство оплаты",
            "pains": "Высокая цена, долгая доставка, сложный возврат, недоверие к новым магазинам",
            "usp": "Быстрая доставка от 1 дня, гарантия возврата 30 дней, оплата при получении",
            "keyword_modifiers": ["купить", "заказать", "цена", "интернет-магазин", "с доставкой", "оптом", "недорого", "официальный сайт", "каталог", "в наличии", "дешево", "распродажа"],
        },
    },
    {
        "id": "services_local",
        "name": "Локальные услуги",
        "icon": "📍",
        "data": {
            "niche": "Локальные услуги (ремонт, клининг, мастера)",
            "price_segment": "middle",
            "campaign_goal": "leads",
            "target_audience": "Жители конкретного города/района, нуждающиеся в быстром решении бытовых проблем",
            "pains": "Сложно найти надёжного мастера, непрозрачная цена, долгое ожидание",
            "usp": "Выезд в день обращения, фиксированная цена, гарантия на работы",
            "keyword_modifiers": ["заказать", "вызвать", "цена", "стоимость", "недорого", "срочно", "на дом", "с гарантией", "рядом", "быстро", "профессионально"],
        },
    },
    {
        "id": "b2b_saas",
        "name": "B2B / SaaS",
        "icon": "💼",
        "data": {
            "niche": "B2B SaaS / программное обеспечение для бизнеса",
            "price_segment": "high",
            "campaign_goal": "leads",
            "target_audience": "ЛПР и специалисты компаний 20–500 сотрудников, ищущие автоматизацию процессов",
            "pains": "Ручные процессы, ошибки из-за человеческого фактора, сложная интеграция с текущими системами",
            "usp": "Интеграция за 1 день, бесплатный пробный период 14 дней, выделенный менеджер",
            "keyword_modifiers": ["программа", "система", "автоматизация", "для бизнеса", "онлайн", "попробовать бесплатно", "демо", "тарифы", "интеграция", "купить лицензию"],
        },
    },
    {
        "id": "real_estate",
        "name": "Недвижимость",
        "icon": "🏠",
        "data": {
            "niche": "Недвижимость (продажа/аренда)",
            "price_segment": "high",
            "campaign_goal": "leads",
            "target_audience": "Покупатели и арендаторы 28–55 лет, принимающие решение от 1 до 6 месяцев",
            "pains": "Страх обмана, юридические риски, сложность выбора, завышенные комиссии агентов",
            "usp": "Юридическая проверка объекта, фиксированная комиссия, персональный риелтор",
            "keyword_modifiers": ["купить", "продать", "аренда", "снять", "цена", "стоимость", "без посредников", "ипотека", "новостройка", "вторичка", "от собственника", "недорого"],
        },
    },
    {
        "id": "education",
        "name": "Образование / курсы",
        "icon": "🎓",
        "data": {
            "niche": "Онлайн-образование, курсы, обучение",
            "price_segment": "middle",
            "campaign_goal": "registrations",
            "target_audience": "Люди 20–40 лет, желающие сменить профессию или повысить квалификацию",
            "pains": "Нет времени, боятся не освоить, сомневаются в практической пользе, много дешёвых курсов",
            "usp": "Практика с первого урока, поддержка куратора, помощь в трудоустройстве",
            "keyword_modifiers": ["курс", "обучение", "онлайн", "записаться", "бесплатно", "с нуля", "сертификат", "цена", "стоимость", "отзывы", "для начинающих", "профессия"],
        },
    },
    {
        "id": "medicine",
        "name": "Медицина / клиники",
        "icon": "🏥",
        "data": {
            "niche": "Частные медицинские клиники и услуги",
            "price_segment": "high",
            "campaign_goal": "appointments",
            "target_audience": "Пациенты 30–60 лет, выбирающие между ОМС и платной медициной, ценят скорость и качество",
            "pains": "Долгие очереди в госполиклинике, недоступность нужных специалистов, страх поставить неверный диагноз",
            "usp": "Запись за 2 часа, опытные специалисты, современное оборудование",
            "keyword_modifiers": ["клиника", "врач", "записаться", "цена", "стоимость", "платно", "онлайн", "без очереди", "анализы", "диагностика", "лечение", "консультация"],
        },
    },
    {
        "id": "auto",
        "name": "Автосервис / авто",
        "icon": "🚗",
        "data": {
            "niche": "Автосервис, автозапчасти, автомобили",
            "price_segment": "middle",
            "campaign_goal": "leads",
            "target_audience": "Автовладельцы 25–55 лет, ищущие надёжный и недорогой сервис",
            "pains": "Боятся переплатить, не доверяют незнакомым сервисам, не разбираются в ценах",
            "usp": "Прозрачная диагностика, официальные запчасти, гарантия на работы 6 месяцев",
            "keyword_modifiers": ["ремонт", "замена", "цена", "стоимость", "запчасти", "оригинал", "срочно", "недорого", "с гарантией", "купить", "установка", "сервис"],
        },
    },
    {
        "id": "beauty",
        "name": "Красота / салоны",
        "icon": "💄",
        "data": {
            "niche": "Салоны красоты, студии, косметология",
            "price_segment": "middle",
            "campaign_goal": "appointments",
            "target_audience": "Женщины 18–45 лет, следящие за внешностью, активные в соцсетях",
            "pains": "Не уверены в результате, боятся испортить волосы/кожу, ищут мастера с портфолио",
            "usp": "Мастера с сертификатами, фото работ до/после, запись онлайн 24/7",
            "keyword_modifiers": ["салон", "записаться", "цена", "стоимость", "недорого", "рядом", "акция", "мастер", "отзывы", "онлайн запись", "профессионально"],
        },
    },
    {
        "id": "construction",
        "name": "Строительство домов",
        "icon": "🏗️",
        "data": {
            "niche": "Строительство домов (каркасные, из СИП-панелей, из бруса)",
            "price_segment": "middle",
            "campaign_goal": "leads",
            "target_audience": "Семьи 30–55 лет, планирующие строительство собственного дома, средний класс, ценящие надёжность и прозрачность",
            "pains": "Страх быть обманутыми, срыв сроков строительства, непрозрачные сметы, низкое качество материалов",
            "usp": "Строительство под ключ с фиксированной ценой по договору, гарантия от 5 лет, прозрачная смета",
            "keyword_modifiers": ["купить", "заказать", "под ключ", "цена", "стоимость", "недорого", "проект", "с гарантией", "от производителя", "каркасный", "из сип панелей", "из бруса"],
        },
    },
]


def _get_templates(db: Session) -> list[dict]:
    """Return templates from DB or defaults."""
    raw = get_setting("brief_templates", db)
    if raw:
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            logger.warning("Invalid brief_templates JSON in DB, using defaults")
    return DEFAULT_TEMPLATES


# ── Public endpoints (for BriefTab) ──────────────────────────────────────────

@router.get("/briefs/templates")
def list_templates(db: Annotated[Session, Depends(get_db)]):
    """Return all available brief templates."""
    templates = _get_templates(db)
    return {"templates": [{"id": t["id"], "name": t["name"], "icon": t["icon"]} for t in templates]}


@router.get("/briefs/templates/{template_id}")
def get_template(template_id: str, db: Annotated[Session, Depends(get_db)]):
    """Return brief template data by id."""
    templates = _get_templates(db)
    tmpl = next((t for t in templates if t["id"] == template_id), None)
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tmpl


# ── Admin endpoints (for SettingsPage) ───────────────────────────────────────

@router.get("/settings/brief-templates")
def get_all_templates(
    _: Annotated[object, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    """Return all templates with full data for editing."""
    return {"templates": _get_templates(db)}


class TemplateData(BaseModel):
    niche: str = ""
    price_segment: str = "middle"
    campaign_goal: str = "leads"
    target_audience: str = ""
    pains: str = ""
    usp: str = ""
    keyword_modifiers: list[str] = []


class TemplateCreate(BaseModel):
    id: str
    name: str
    icon: str = ""
    data: TemplateData


class TemplateUpdate(BaseModel):
    name: str | None = None
    icon: str | None = None
    data: TemplateData | None = None


@router.put("/settings/brief-templates")
def save_all_templates(
    templates: list[TemplateCreate],
    current_user: CurrentUser,
    _: Annotated[object, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    """Replace all templates at once."""
    data = [t.model_dump() for t in templates]
    set_setting("brief_templates", json.dumps(data, ensure_ascii=False), db, updated_by=current_user.id)
    return {"detail": "Updated", "count": len(data)}


@router.post("/settings/brief-templates", status_code=201)
def add_template(
    body: TemplateCreate,
    current_user: CurrentUser,
    _: Annotated[object, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    """Add a single template."""
    templates = _get_templates(db)
    if any(t["id"] == body.id for t in templates):
        raise HTTPException(status_code=409, detail=f"Template '{body.id}' already exists")
    templates.append(body.model_dump())
    set_setting("brief_templates", json.dumps(templates, ensure_ascii=False), db, updated_by=current_user.id)
    return body.model_dump()


@router.put("/settings/brief-templates/{template_id}")
def update_template(
    template_id: str,
    body: TemplateUpdate,
    current_user: CurrentUser,
    _: Annotated[object, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    """Update a single template."""
    templates = _get_templates(db)
    idx = next((i for i, t in enumerate(templates) if t["id"] == template_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Template not found")
    if body.name is not None:
        templates[idx]["name"] = body.name
    if body.icon is not None:
        templates[idx]["icon"] = body.icon
    if body.data is not None:
        templates[idx]["data"] = body.data.model_dump()
    set_setting("brief_templates", json.dumps(templates, ensure_ascii=False), db, updated_by=current_user.id)
    return templates[idx]


@router.delete("/settings/brief-templates/{template_id}", status_code=204)
def delete_template(
    template_id: str,
    current_user: CurrentUser,
    _: Annotated[object, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    """Delete a single template."""
    templates = _get_templates(db)
    new_templates = [t for t in templates if t["id"] != template_id]
    if len(new_templates) == len(templates):
        raise HTTPException(status_code=404, detail="Template not found")
    set_setting("brief_templates", json.dumps(new_templates, ensure_ascii=False), db, updated_by=current_user.id)


@router.post("/settings/brief-templates/reset", status_code=200)
def reset_templates(
    current_user: CurrentUser,
    _: Annotated[object, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    """Reset templates to defaults."""
    from app.services.settings_service import delete_setting
    delete_setting("brief_templates", db)
    return {"detail": "Reset to defaults", "count": len(DEFAULT_TEMPLATES)}
