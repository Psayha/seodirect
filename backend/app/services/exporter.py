"""Export service: XLS for Yandex Direct Commander and Markdown strategy."""
from __future__ import annotations

import io
from typing import TYPE_CHECKING

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


def _header_row(ws, headers: list[str]) -> None:
    """Write bold header row with light grey background."""
    fill = PatternFill(start_color="D3D3D3", end_color="D3D3D3", fill_type="solid")
    bold = Font(bold=True)
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = bold
        cell.fill = fill
        cell.alignment = Alignment(horizontal="center")
    ws.freeze_panes = "A2"


def export_direct_xls(project_id, db: "Session") -> bytes:
    """Export campaigns, groups, ads, keywords, negative keywords to XLS."""
    from sqlalchemy import select
    from app.models.direct import Campaign, AdGroup, Keyword, NegativeKeyword, Ad
    from app.models.project import Project
    import uuid

    if not isinstance(project_id, uuid.UUID):
        project_id = uuid.UUID(str(project_id))

    project = db.get(Project, project_id)
    if not project:
        raise ValueError("Project not found")

    campaigns = db.scalars(
        select(Campaign).where(Campaign.project_id == project_id).order_by(Campaign.priority)
    ).all()

    campaign_ids = [c.id for c in campaigns]

    groups = db.scalars(
        select(AdGroup).where(AdGroup.campaign_id.in_(campaign_ids))
    ).all() if campaign_ids else []

    group_ids = [g.id for g in groups]

    keywords = db.scalars(
        select(Keyword).where(Keyword.ad_group_id.in_(group_ids))
    ).all() if group_ids else []

    ads = db.scalars(
        select(Ad).where(Ad.ad_group_id.in_(group_ids))
    ).all() if group_ids else []

    neg_keywords = db.scalars(
        select(NegativeKeyword).where(NegativeKeyword.project_id == project_id)
    ).all()

    # Build lookup maps
    campaign_map = {c.id: c for c in campaigns}
    group_map = {g.id: g for g in groups}

    wb = Workbook()
    wb.remove(wb.active)  # remove default sheet

    # ── Sheet: Campaigns ────────────────────────────────────────────────────
    ws_c = wb.create_sheet("Campaigns")
    c_headers = ["Campaign Name", "Type", "Status", "Budget", "Priority", "Geo", "Strategy Notes"]
    _header_row(ws_c, c_headers)
    for row, c in enumerate(campaigns, 2):
        ws_c.cell(row, 1, c.name)
        ws_c.cell(row, 2, c.type or "")
        ws_c.cell(row, 3, c.status.value)
        ws_c.cell(row, 4, float(c.budget_monthly) if c.budget_monthly else "")
        ws_c.cell(row, 5, c.priority)
        ws_c.cell(row, 6, str(c.geo) if c.geo else "")
        # Truncate strategy text for cell
        strategy = (c.strategy_text or "")[:1000]
        ws_c.cell(row, 7, strategy)

    # ── Sheet: AdGroups ─────────────────────────────────────────────────────
    ws_g = wb.create_sheet("AdGroups")
    g_headers = ["Campaign Name", "Group Name", "Status"]
    _header_row(ws_g, g_headers)
    for row, g in enumerate(groups, 2):
        campaign = campaign_map.get(g.campaign_id)
        ws_g.cell(row, 1, campaign.name if campaign else "")
        ws_g.cell(row, 2, g.name)
        ws_g.cell(row, 3, g.status)

    # ── Sheet: Ads ──────────────────────────────────────────────────────────
    ws_a = wb.create_sheet("Ads")
    a_headers = [
        "Campaign Name", "Group Name", "Headline 1", "Headline 2", "Headline 3",
        "Text", "Display URL", "UTM", "Status", "Variant",
        "H1 Len", "H2 Len", "H3 Len", "Text Len", "Valid"
    ]
    _header_row(ws_a, a_headers)
    for row, ad in enumerate(ads, 2):
        group = group_map.get(ad.ad_group_id)
        campaign = campaign_map.get(group.campaign_id) if group else None
        h1 = ad.headline1 or ""
        h2 = ad.headline2 or ""
        h3 = ad.headline3 or ""
        txt = ad.text or ""
        valid = len(h1) <= 56 and len(h2) <= 30 and len(h3) <= 30 and len(txt) <= 81
        ws_a.cell(row, 1, campaign.name if campaign else "")
        ws_a.cell(row, 2, group.name if group else "")
        ws_a.cell(row, 3, h1)
        ws_a.cell(row, 4, h2)
        ws_a.cell(row, 5, h3)
        ws_a.cell(row, 6, txt)
        ws_a.cell(row, 7, ad.display_url or "")
        ws_a.cell(row, 8, ad.utm or "")
        ws_a.cell(row, 9, ad.status.value)
        ws_a.cell(row, 10, ad.variant)
        ws_a.cell(row, 11, len(h1))
        ws_a.cell(row, 12, len(h2))
        ws_a.cell(row, 13, len(h3))
        ws_a.cell(row, 14, len(txt))
        ws_a.cell(row, 15, "✅" if valid else "❌")
        # Highlight invalid rows
        if not valid:
            red = PatternFill(start_color="FFB3B3", end_color="FFB3B3", fill_type="solid")
            for col in range(1, 16):
                ws_a.cell(row, col).fill = red

    # ── Sheet: Keywords ─────────────────────────────────────────────────────
    ws_k = wb.create_sheet("Keywords")
    k_headers = ["Campaign Name", "Group Name", "Phrase", "Match Type", "Temperature", "Frequency", "Status"]
    _header_row(ws_k, k_headers)
    for row, kw in enumerate(keywords, 2):
        group = group_map.get(kw.ad_group_id)
        campaign = campaign_map.get(group.campaign_id) if group else None
        ws_k.cell(row, 1, campaign.name if campaign else "")
        ws_k.cell(row, 2, group.name if group else "")
        ws_k.cell(row, 3, kw.phrase)
        ws_k.cell(row, 4, kw.match_type)
        ws_k.cell(row, 5, kw.temperature.value if kw.temperature else "")
        ws_k.cell(row, 6, kw.frequency or "")
        ws_k.cell(row, 7, kw.status.value)

    # ── Sheet: NegativeKeywords ─────────────────────────────────────────────
    ws_n = wb.create_sheet("NegativeKeywords")
    n_headers = ["Phrase", "Block", "Campaign (if campaign-level)"]
    _header_row(ws_n, n_headers)
    for row, nk in enumerate(neg_keywords, 2):
        ws_n.cell(row, 1, nk.phrase)
        ws_n.cell(row, 2, nk.block or "general")
        campaign = campaign_map.get(nk.campaign_id) if nk.campaign_id else None
        ws_n.cell(row, 3, campaign.name if campaign else "")

    # Auto-fit column widths (approximate)
    for ws in wb.worksheets:
        for col_cells in ws.columns:
            max_len = max((len(str(cell.value or "")) for cell in col_cells), default=0)
            ws.column_dimensions[get_column_letter(col_cells[0].column)].width = min(max_len + 4, 50)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()


def export_strategy_md(project_id, db: "Session") -> str:
    """Export Direct strategy as Markdown."""
    from sqlalchemy import select
    from app.models.direct import Campaign, AdGroup, Keyword
    from app.models.project import Project
    from app.models.brief import Brief
    import uuid

    if not isinstance(project_id, uuid.UUID):
        project_id = uuid.UUID(str(project_id))

    project = db.get(Project, project_id)
    if not project:
        raise ValueError("Project not found")

    brief = db.scalar(select(Brief).where(Brief.project_id == project_id))
    campaigns = db.scalars(
        select(Campaign).where(Campaign.project_id == project_id).order_by(Campaign.priority)
    ).all()

    lines = []
    lines.append(f"# Стратегия Яндекс Директ — {project.name}")
    lines.append(f"**Клиент:** {project.client_name}  ")
    lines.append(f"**Сайт:** {project.url}  ")
    lines.append("")

    if brief:
        lines.append("## Бриф")
        if brief.niche:
            lines.append(f"- **Ниша:** {brief.niche}")
        if brief.products:
            lines.append(f"- **Продукты/услуги:** {brief.products}")
        if brief.usp:
            lines.append(f"- **УТП:** {brief.usp}")
        if brief.campaign_goal:
            lines.append(f"- **Цель кампании:** {brief.campaign_goal}")
        if brief.ad_geo:
            lines.append(f"- **Гео:** {', '.join(brief.ad_geo)}")
        if brief.monthly_budget:
            lines.append(f"- **Бюджет:** {brief.monthly_budget} ₽/мес")
        lines.append("")

    lines.append("## Кампании")
    for c in campaigns:
        lines.append(f"### {c.name}")
        if c.type:
            lines.append(f"**Тип:** {c.type}")
        if c.budget_monthly:
            lines.append(f"**Бюджет:** {c.budget_monthly} ₽/мес")
        if c.strategy_text:
            lines.append("")
            lines.append(c.strategy_text)
        lines.append("")

        # Groups + keywords
        groups = db.scalars(select(AdGroup).where(AdGroup.campaign_id == c.id)).all()
        for g in groups:
            lines.append(f"#### Группа: {g.name}")
            keywords = db.scalars(
                select(Keyword).where(Keyword.ad_group_id == g.id).order_by(Keyword.frequency.desc().nullslast())
            ).all()
            if keywords:
                lines.append("")
                lines.append("| Фраза | Частота | Температура |")
                lines.append("|-------|---------|-------------|")
                for kw in keywords[:20]:
                    freq = str(kw.frequency) if kw.frequency else "—"
                    temp = kw.temperature.value if kw.temperature else "—"
                    lines.append(f"| {kw.phrase} | {freq} | {temp} |")
            lines.append("")

    return "\n".join(lines)


def validate_export(project_id, db: "Session") -> dict:
    """Pre-export validation summary."""
    from sqlalchemy import select, func
    from app.models.direct import Campaign, AdGroup, Keyword, NegativeKeyword, Ad
    import uuid

    if not isinstance(project_id, uuid.UUID):
        project_id = uuid.UUID(str(project_id))

    campaigns = db.scalars(select(Campaign).where(Campaign.project_id == project_id)).all()
    campaign_ids = [c.id for c in campaigns]
    groups = db.scalars(select(AdGroup).where(AdGroup.campaign_id.in_(campaign_ids))).all() if campaign_ids else []
    group_ids = [g.id for g in groups]
    keywords = db.scalars(select(Keyword).where(Keyword.ad_group_id.in_(group_ids))).all() if group_ids else []
    ads = db.scalars(select(Ad).where(Ad.ad_group_id.in_(group_ids))).all() if group_ids else []
    neg_kws = db.scalars(select(NegativeKeyword).where(NegativeKeyword.project_id == project_id)).all()

    warnings = []
    invalid_ads = []
    for ad in ads:
        issues = []
        if len(ad.headline1 or "") > 56:
            issues.append("headline1 > 56 chars")
        if len(ad.headline2 or "") > 30:
            issues.append("headline2 > 30 chars")
        if len(ad.headline3 or "") > 30:
            issues.append("headline3 > 30 chars")
        if len(ad.text or "") > 81:
            issues.append("text > 81 chars")
        if issues:
            invalid_ads.append({"ad_id": str(ad.id), "issues": issues})

    if invalid_ads:
        warnings.append(f"{len(invalid_ads)} объявлений превышают лимиты символов")

    if not keywords:
        warnings.append("Семантическое ядро пустое")

    if not ads:
        warnings.append("Объявления не созданы")

    return {
        "campaigns_count": len(campaigns),
        "groups_count": len(groups),
        "ads_count": len(ads),
        "keywords_count": len(keywords),
        "negative_keywords_count": len(neg_kws),
        "warnings": warnings,
        "invalid_ads": invalid_ads,
        "ready": len(warnings) == 0,
    }
