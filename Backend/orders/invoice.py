from decimal import Decimal
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable, SimpleDocTemplate, Spacer, Table, TableStyle,
)
from reportlab.platypus import Paragraph as P

ACCENT = colors.HexColor('#DC2626')
DARK   = colors.HexColor('#111827')
GREY   = colors.HexColor('#6B7280')
LGREY  = colors.HexColor('#F3F4F6')

SELLER_NAME    = 'PRONOUN JEANS'
SELLER_ADDRESS = 'Mumbai, Maharashtra, India'
SELLER_WEB     = 'www.pronounjeans.com'
SELLER_EMAIL   = 'hello@pronounjeans.com'

SHIPPING_FEE            = Decimal('300.00')
FREE_SHIPPING_THRESHOLD = Decimal('15000.00')


def _p(text, size=9, color=DARK, bold=False, align=TA_LEFT, leading=13):
    style = ParagraphStyle(
        'c',
        fontName='Helvetica-Bold' if bold else 'Helvetica',
        fontSize=size,
        textColor=color,
        alignment=align,
        leading=leading,
    )
    return P(str(text), style)


def _fmt(amount):
    return f'Rs. {float(amount):,.2f}'


def generate_invoice_pdf(order):
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
    )
    story = []

    # ── Header ──────────────────────────────────────────────────────────
    header = Table(
        [
            [_p(SELLER_NAME, size=20, bold=True), _p('TAX INVOICE', size=14, color=ACCENT, bold=True, align=TA_RIGHT)],
            [_p(SELLER_ADDRESS, size=8, color=GREY), _p(f'Invoice No: INV-{order.id:05d}', size=8, color=GREY, align=TA_RIGHT)],
            [_p(SELLER_WEB, size=8, color=GREY), _p(order.created_at.strftime('%d %b %Y'), size=8, color=GREY, align=TA_RIGHT)],
        ],
        colWidths=['60%', '40%'],
    )
    header.setStyle(TableStyle([
        ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING',   (0, 0), (-1, -1), 0),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 0),
        ('TOPPADDING',    (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    story.append(header)
    story.append(Spacer(1, 3 * mm))
    story.append(HRFlowable(width='100%', thickness=1.5, color=ACCENT, spaceAfter=5 * mm))

    # ── Bill To / Order Details ──────────────────────────────────────────
    user = order.user
    buyer_lines = ['<b>BILL TO</b>']
    if user:
        if user.company_name:
            buyer_lines.append(f'<b>{user.company_name}</b>')
        full = f'{user.first_name} {user.last_name}'.strip()
        if full:
            buyer_lines.append(full)
        if user.gst_number:
            buyer_lines.append(f'GSTIN: {user.gst_number}')
        if user.phone_number:
            buyer_lines.append(user.phone_number)
        buyer_lines.append(user.email)

    order_lines = [
        f'<b>Order No:</b>  #{order.id}',
        f'<b>Status:</b>  {order.status.replace("_", " ").title()}',
        f'<b>Payment:</b>  {order.get_payment_method_display()}',
        f'<b>Payment Status:</b>  {order.payment_status.title()}',
    ]
    if order.payment_plan:
        order_lines.append(f'<b>Plan:</b>  {order.get_payment_plan_display()}')

    info = Table(
        [[
            _p('<br/>'.join(buyer_lines), size=9, leading=14),
            _p('<br/>'.join(order_lines), size=9, leading=14, align=TA_RIGHT),
        ]],
        colWidths=['50%', '50%'],
    )
    info.setStyle(TableStyle([
        ('VALIGN',       (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING',  (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(info)
    story.append(Spacer(1, 4 * mm))

    # ── Shipping Address ─────────────────────────────────────────────────
    if order.shipping_address:
        a = order.shipping_address
        parts = [a.address_line_1]
        if a.address_line_2:
            parts.append(a.address_line_2)
        parts.append(f'{a.city}, {a.state} {a.pincode}')
        # The delivery contact, resolved through the account when the address
        # carries none. A shipping block with no number on it is the one a
        # courier calls the office about.
        contact = ' · '.join(x for x in (a.effective_phone, a.effective_email) if x)
        if contact:
            parts.append(contact)
        ship = Table(
            [[_p('<b>SHIP TO</b>', size=8, color=GREY), _p(', '.join(parts), size=9)]],
            colWidths=['18%', '82%'],
        )
        ship.setStyle(TableStyle([
            ('VALIGN',       (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING',  (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ]))
        story.append(ship)
        story.append(Spacer(1, 4 * mm))

    story.append(HRFlowable(width='100%', thickness=0.5, color=LGREY, spaceAfter=4 * mm))

    # ── Items Table ──────────────────────────────────────────────────────
    rows = [['#', 'Product', 'SKU', 'Qty', 'Unit Price', 'Total']]
    for i, item in enumerate(order.items.select_related('variation__product'), 1):
        if item.variation_id and item.variation:
            name = item.variation.product.name if item.variation.product_id else '—'
            sku  = item.variation.sku
        else:
            name, sku = '[Product removed]', '—'
        rows.append([
            str(i),
            name,
            sku,
            str(item.quantity),
            _fmt(item.price),
            _fmt(item.price * item.quantity),
        ])

    fixed_w = 8 * mm + 32 * mm + 12 * mm + 28 * mm + 28 * mm
    desc_w  = doc.width - fixed_w
    items_tbl = Table(rows, colWidths=[8*mm, desc_w, 32*mm, 12*mm, 28*mm, 28*mm], repeatRows=1)
    items_tbl.setStyle(TableStyle([
        ('BACKGROUND',     (0, 0), (-1, 0), LGREY),
        ('TEXTCOLOR',      (0, 0), (-1, 0), GREY),
        ('FONTNAME',       (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE',       (0, 0), (-1, 0), 8),
        ('TOPPADDING',     (0, 0), (-1, 0), 6),
        ('BOTTOMPADDING',  (0, 0), (-1, 0), 6),
        ('FONTNAME',       (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE',       (0, 1), (-1, -1), 9),
        ('TOPPADDING',     (0, 1), (-1, -1), 7),
        ('BOTTOMPADDING',  (0, 1), (-1, -1), 7),
        ('TEXTCOLOR',      (0, 1), (-1, -1), DARK),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LGREY]),
        ('ALIGN',          (0, 0), (0, -1), 'CENTER'),
        ('ALIGN',          (3, 0), (5, -1), 'RIGHT'),
        ('LINEBELOW',      (0, 0), (-1, 0), 1, ACCENT),
        ('GRID',           (0, 0), (-1, -1), 0.3, colors.HexColor('#E5E7EB')),
        ('BOX',            (0, 0), (-1, -1), 0.5, colors.HexColor('#E5E7EB')),
    ]))
    story.append(items_tbl)
    story.append(Spacer(1, 4 * mm))

    # ── Totals ───────────────────────────────────────────────────────────
    subtotal  = max(order.total_amount - Decimal(str(order.discount_amount)), Decimal('0'))
    after_upi = max(subtotal - Decimal(str(order.upi_discount)), Decimal('0'))
    shipping  = SHIPPING_FEE if after_upi < FREE_SHIPPING_THRESHOLD else Decimal('0')

    GREEN = colors.HexColor('#16A34A')
    total_rows = [
        (_p('Subtotal', size=9, color=GREY, align=TA_RIGHT),
         _p(_fmt(order.total_amount), size=9, align=TA_RIGHT)),
    ]
    if order.discount_amount > 0:
        lbl = f'Coupon ({order.coupon.code})' if order.coupon_id else 'Coupon Discount'
        total_rows.append((
            _p(lbl, size=9, color=GREY, align=TA_RIGHT),
            _p(f'- {_fmt(order.discount_amount)}', size=9, color=GREEN, align=TA_RIGHT),
        ))
    if order.upi_discount > 0:
        disc_lbl = 'Full Payment Discount (1%)' if order.payment_plan == 'full' else 'Prepaid Discount'
        total_rows.append((
            _p(disc_lbl, size=9, color=GREY, align=TA_RIGHT),
            _p(f'- {_fmt(order.upi_discount)}', size=9, color=GREEN, align=TA_RIGHT),
        ))
    total_rows.append((
        _p('Shipping', size=9, color=GREY, align=TA_RIGHT),
        _p(_fmt(shipping) if shipping > 0 else 'FREE', size=9, align=TA_RIGHT),
    ))

    total_data = [[r[0], r[1]] for r in total_rows]
    total_data.append([
        _p('<b>Grand Total</b>', size=11, bold=True, align=TA_RIGHT),
        _p(f'<b>{_fmt(order.grand_total)}</b>', size=11, color=ACCENT, bold=True, align=TA_RIGHT),
    ])

    total_tbl = Table(total_data, colWidths=['75%', '25%'])
    total_tbl.setStyle(TableStyle([
        ('LEFTPADDING',   (0, 0), (-1, -1), 4),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 0),
        ('TOPPADDING',    (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LINEABOVE',     (0, -1), (-1, -1), 1, DARK),
        ('TOPPADDING',    (0, -1), (-1, -1), 7),
        ('BOTTOMPADDING', (0, -1), (-1, -1), 7),
    ]))
    story.append(total_tbl)
    story.append(Spacer(1, 5 * mm))
    story.append(HRFlowable(width='100%', thickness=0.5, color=LGREY, spaceAfter=4 * mm))

    # ── Payment Summary ──────────────────────────────────────────────────
    pay_lines = [f'<b>Amount Paid:</b>  {_fmt(order.amount_paid)}']
    if order.balance_due > 0:
        pay_lines.append(f'<b>Balance Due:</b>  {_fmt(order.balance_due)}')
    if order.utr_number:
        pay_lines.append(f'<b>UTR Reference:</b>  {order.utr_number}')
    story.append(_p('<br/>'.join(pay_lines), size=9, leading=15))
    story.append(Spacer(1, 8 * mm))

    # ── Footer ───────────────────────────────────────────────────────────
    story.append(HRFlowable(width='100%', thickness=0.5, color=LGREY, spaceAfter=4 * mm))
    story.append(_p('Thank you for your business with Pronoun Jeans.', size=9, color=GREY, align=TA_CENTER))
    story.append(_p(f'{SELLER_WEB}  |  {SELLER_EMAIL}', size=8, color=GREY, align=TA_CENTER))

    doc.build(story)
    buffer.seek(0)
    return buffer
