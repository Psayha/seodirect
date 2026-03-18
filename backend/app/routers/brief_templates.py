import logging
logger = logging.getLogger(__name__)
"""Brief templates by niche — static data."""
from fastapi import APIRouter

router = APIRouter()

TEMPLATES = [
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
        },
    },
]


@router.get("/briefs/templates")
def list_templates():
    """Return all available brief templates."""
    return {"templates": [{"id": t["id"], "name": t["name"], "icon": t["icon"]} for t in TEMPLATES]}


@router.get("/briefs/templates/{template_id}")
def get_template(template_id: str):
    """Return brief template data by id."""
    tmpl = next((t for t in TEMPLATES if t["id"] == template_id), None)
    if not tmpl:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Template not found")
    return tmpl
