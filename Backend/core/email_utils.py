import logging
import threading
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.conf import settings
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.utils.http import urlsafe_base64_encode
from django.utils.encoding import force_bytes

logger = logging.getLogger(__name__)

ADMIN_EMAIL = 'pronounjeans@gmail.com'


def _send(subject, template, context, to, reply_to=None):
    def _do_send():
        try:
            html_body  = render_to_string(template, context)
            recipients = [to] if isinstance(to, str) else to
            msg = EmailMultiAlternatives(
                subject    = subject,
                body       = subject,
                from_email = settings.DEFAULT_FROM_EMAIL,
                to         = recipients,
                reply_to   = [reply_to] if reply_to else None,
            )
            msg.attach_alternative(html_body, 'text/html')
            msg.send(fail_silently=False)
        except Exception:
            logger.exception('Failed to send email "%s" to %s', subject, to)

    threading.Thread(target=_do_send, daemon=True).start()


def _make_reset_link(user):
    token = PasswordResetTokenGenerator().make_token(user)
    uid   = urlsafe_base64_encode(force_bytes(user.pk))
    link  = f"{settings.FRONTEND_URL}/reset-password/{uid}/{token}/"
    return link, uid, token


def _prepare_items(order):
    items = list(order.items.select_related('variation__product').all())
    for item in items:
        item.line_total = item.quantity * item.price
    return items


# ── Account emails ────────────────────────────────────────────────────────────

def send_password_reset_email(user):
    link, uid, token = _make_reset_link(user)
    _send(
        subject  = 'Reset your Pronoun Jeans password',
        template = 'emails/password_reset.html',
        context  = {
            'user':         user,
            'reset_link':   link,
            'frontend_url': settings.FRONTEND_URL,
        },
        to = user.email,
    )
    return uid, token


def send_onboarding_welcome_email(user):
    link, _, _ = _make_reset_link(user)
    _send(
        subject  = "You're invited to Pronoun Jeans B2B",
        template = 'emails/onboarding_welcome.html',
        context  = {
            'user':              user,
            'set_password_link': link,
            'frontend_url':      settings.FRONTEND_URL,
        },
        to = user.email,
    )


def send_b2b_approved_email(user):
    # Users who signed up themselves already have a password and just need to
    # log in. If an approved account somehow has no usable password, include a
    # set-password link so they can still get in.
    context = {
        'user':         user,
        'frontend_url': settings.FRONTEND_URL,
        'login_link':   f"{settings.FRONTEND_URL}/login",
    }
    if not user.has_usable_password():
        context['set_password_link'], _, _ = _make_reset_link(user)
    _send(
        subject  = "You're approved — welcome to Pronoun Jeans B2B",
        template = 'emails/b2b_approved.html',
        context  = context,
        to       = user.email,
    )


def send_request_access_received_email(user):
    _send(
        subject  = 'We received your request — Pronoun Jeans',
        template = 'emails/request_access_received.html',
        context  = {
            'user':         user,
            'frontend_url': settings.FRONTEND_URL,
        },
        to = user.email,
    )


def send_request_access_admin_email(user):
    _send(
        subject  = f'New B2B request: {user.company_name} ({user.email})',
        template = 'emails/request_access_admin.html',
        context  = {'user': user},
        to       = ADMIN_EMAIL,
    )


# ── Order emails ──────────────────────────────────────────────────────────────

def send_order_placed_email(order):
    _send(
        subject  = f'Order #{order.id:05d} received — Pronoun Jeans',
        template = 'emails/order_placed.html',
        context  = {
            'order':        order,
            'items':        _prepare_items(order),
            'frontend_url': settings.FRONTEND_URL,
        },
        to = order.user.email,
    )


def send_order_status_email(order):
    status_map = {
        'APPROVED':  (f'Order #{order.id:05d} approved — Pronoun Jeans',  'emails/order_approved.html'),
        'SHIPPED':   (f'Order #{order.id:05d} shipped — Pronoun Jeans',   'emails/order_shipped.html'),
        'DELIVERED': (f'Order #{order.id:05d} delivered — Pronoun Jeans', 'emails/order_delivered.html'),
        'CANCELLED': (f'Order #{order.id:05d} cancelled — Pronoun Jeans', 'emails/order_cancelled.html'),
    }
    entry = status_map.get(order.status)
    if not entry:
        return
    subject, template = entry
    _send(
        subject  = subject,
        template = template,
        context  = {
            'order':        order,
            'items':        _prepare_items(order),
            'frontend_url': settings.FRONTEND_URL,
        },
        to = order.user.email,
    )
