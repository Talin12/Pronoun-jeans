import os
import environ
import dj_database_url
from pathlib import Path
from datetime import timedelta

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(DEBUG=(bool, False))
environ.Env.read_env(os.path.join(BASE_DIR, '.env'))

SECRET_KEY = env('SECRET_KEY')
DEBUG      = env('DEBUG')

ALLOWED_HOSTS = env.list(
    'ALLOWED_HOSTS',
    default=['localhost', '127.0.0.1', 'pronoun-jeans.onrender.com'],
)

INSTALLED_APPS = [
    # ── Jazzmin MUST be first — before django.contrib.admin ──────────────────
    'jazzmin',

    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'cloudinary_storage',
    'django.contrib.staticfiles',
    'cloudinary',
    'rest_framework',
    'rest_framework_simplejwt.token_blacklist',
    'anymail',
    'corsheaders',
    'accounts',
    'products',
    'orders',
    'medialib',
    'django.contrib.humanize',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# ── CORS ──────────────────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = env.list(
    'CORS_ALLOWED_ORIGINS',
    default=[
        'http://localhost:5173',
        'https://pronoun-jeans.vercel.app',
        'https://www.pronounjeans.com',
    ],
)
CORS_ALLOW_CREDENTIALS = True

# ── CSRF ──────────────────────────────────────────────────────────────────────
CSRF_TRUSTED_ORIGINS = env.list(
    'CSRF_TRUSTED_ORIGINS',
    default=['http://localhost:5173'],
)

ROOT_URLCONF     = 'core.urls'
WSGI_APPLICATION = 'core.wsgi.application'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

DATABASE_URL = env('DATABASE_URL')
DATABASES = {
    'default': dj_database_url.parse(
        DATABASE_URL,
        conn_max_age=600,
        ssl_require=True,
    )
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE     = 'Asia/Kolkata'
USE_I18N      = True
USE_TZ        = True

STATIC_URL  = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL   = '/media/'
MEDIA_ROOT  = BASE_DIR / 'media'

CLOUDINARY_STORAGE = {
    'CLOUD_NAME': env('CLOUDINARY_CLOUD_NAME'),
    'API_KEY':    env('CLOUDINARY_API_KEY'),
    'API_SECRET': env('CLOUDINARY_API_SECRET'),
}

STORAGES = {
    'default': {
        'BACKEND': 'core.storage.TimeoutMediaCloudinaryStorage',
    },
    'staticfiles': {
        'BACKEND': 'core.storage.NonStrictManifestStaticFilesStorage',
    },
}

STATICFILES_STORAGE = 'django.contrib.staticfiles.storage.StaticFilesStorage'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
AUTH_USER_MODEL    = 'accounts.CustomUser'

if not DEBUG:
    SECURE_PROXY_SSL_HEADER        = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_SSL_REDIRECT            = False  # Render handles SSL at load balancer
    SESSION_COOKIE_SECURE          = True
    CSRF_COOKIE_SECURE             = True
    SECURE_HSTS_SECONDS            = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD            = True

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME':    timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME':   timedelta(days=7),
    'ROTATE_REFRESH_TOKENS':    True,
    'BLACKLIST_AFTER_ROTATION': True,
    'USER_ID_FIELD':            'id',
    'USER_ID_CLAIM':            'user_id',
}

STATICFILES_DIRS = [BASE_DIR / 'static']

BIGSHIP_USERNAME   = env('BIGSHIP_USERNAME',   default='')
BIGSHIP_PASSWORD   = env('BIGSHIP_PASSWORD',   default='')
BIGSHIP_ACCESS_KEY = env('BIGSHIP_ACCESS_KEY', default='')

RAZORPAY_KEY_ID     = env('RAZORPAY_KEY_ID',     default='')
RAZORPAY_KEY_SECRET = env('RAZORPAY_KEY_SECRET', default='')

# ── Email (Resend via Anymail) ────────────────────────────────────────────────
EMAIL_BACKEND      = 'anymail.backends.resend.EmailBackend'
ANYMAIL            = {'RESEND_API_KEY': env('RESEND_API_KEY', default='')}
DEFAULT_FROM_EMAIL = env('DEFAULT_FROM_EMAIL', default='Pronoun Jeans <onboarding@resend.dev>')
FRONTEND_URL       = env('FRONTEND_URL', default='http://localhost:5173')

# ══════════════════════════════════════════════════════════════════════════════
# JAZZMIN — Premium Django Admin UI
# ══════════════════════════════════════════════════════════════════════════════

JAZZMIN_SETTINGS = {
    # ── Branding ───────────────────────────────────────────────────────────────
    'site_title':        'Pronoun Jeans B2B',
    'site_header':       'Pronoun Jeans B2B',
    'site_brand':        'Pronoun Jeans',
    'site_logo':         'admin/img/logo.png',
    'login_logo':        'admin/img/logo.png',
    'login_logo_dark':   'admin/img/logo.png',
    'site_logo_classes': 'img-fluid',
    'site_icon':         None,
    'welcome_sign':      'Welcome to Pronoun Jeans B2B Admin',
    'copyright':         'Pronoun Jeans © 2026',

    # ── Search ─────────────────────────────────────────────────────────────────
    # These models will be globally searchable from the top bar
    'search_model': ['accounts.CustomUser', 'products.Product', 'orders.Order'],

    # ── Top navigation ─────────────────────────────────────────────────────────
    'topmenu_links': [
        {'name': 'Dashboard',  'url': 'admin:index', 'permissions': ['auth.view_user']},
        {'name': 'View Store', 'url': 'https://www.pronounjeans.com', 'new_window': True},
        {'model': 'accounts.CustomUser'},
    ],

    # ── User avatar menu (top right) ───────────────────────────────────────────
    'usermenu_links': [
        {'name': 'View Store', 'url': 'https://www.pronounjeans.com', 'new_window': True, 'icon': 'fas fa-store'},
    ],

    # ── Sidebar menu order & icons ─────────────────────────────────────────────
    # Models not listed here still appear but go to the bottom automatically.
    'order_with_respect_to': [
        # 1. Orders first — most used daily
        'orders',
        'orders.Order',
        'orders.Cart',
        'orders.Commission',
        'orders.Coupon',
        'orders.SampleOrder',

        # 2. Products
        'products',
        'products.Product',
        'products.ProductVariation',
        'products.SizeSet',
        'products.Category',
        'products.Color',
        'products.HeroSlide',

        # 3. Accounts / Agents
        'accounts',
        'accounts.CustomUser',
        'accounts.AgentProfile',
        'accounts.AgentPayment',
        'accounts.Address',

        # 4. Auth (Django built-in — keep at bottom)
        'auth',
        'auth.Group',
    ],

    # FontAwesome 5 icons — keyed as 'app.ModelName'
    'icons': {
        # Orders app
        'orders.Order':          'fas fa-shopping-bag',
        'orders.Cart':           'fas fa-shopping-cart',
        'orders.CartItem':       'fas fa-list',
        'orders.Commission':     'fas fa-percent',
        'orders.Coupon':         'fas fa-tag',
        'orders.SampleOrder':    'fas fa-box-open',
        'orders.OrderItem':      'fas fa-receipt',

        # Products app
        'products.Product':          'fas fa-tshirt',
        'products.ProductVariation': 'fas fa-swatchbook',
        'products.ProductImage':     'fas fa-images',
        'products.SizeSet':          'fas fa-ruler',
        'products.SizeSetBreakdown': 'fas fa-th-list',
        'products.Category':         'fas fa-layer-group',
        'products.Color':            'fas fa-palette',
        'products.HeroSlide':        'fas fa-film',

        # Accounts app
        'accounts.CustomUser':   'fas fa-users',
        'accounts.AgentProfile': 'fas fa-user-tie',
        'accounts.AgentPayment': 'fas fa-money-bill-wave',
        'accounts.Address':      'fas fa-map-marker-alt',

        # Auth
        'auth.Group':            'fas fa-users-cog',
        'auth.User':             'fas fa-user',
    },

    # Fall-back icon for any model not listed above
    'default_icon_parents': 'fas fa-chevron-circle-right',
    'default_icon_children': 'fas fa-circle',

    # ── Sidebar behaviour ──────────────────────────────────────────────────────
    'related_modal_active':         True,   # Open FK selects in a modal
    'custom_css':                   'admin/css/custom_admin.css',
    'custom_js':                    None,
    'use_google_fonts_cdn':         True,
    'show_ui_builder':              False,
    'changeform_format':            'horizontal_tabs',
    'changeform_format_overrides': {
        # Flat layout is cleaner for models with many inline rows
        'products.productvariation': 'collapsible',
        'products.sizeset':          'collapsible',
    },
    'language_chooser': False,
}

# ══════════════════════════════════════════════════════════════════════════════
# JAZZMIN UI TWEAKS — Premium dark-sidebar, light content area
# After deploying, visit /admin/ and use the UI Builder (paintbrush icon)
# to tweak live, then copy the generated dict here and set show_ui_builder=False
# ══════════════════════════════════════════════════════════════════════════════

JAZZMIN_UI_TWEAKS = {
    # ── Theme ──────────────────────────────────────────────────────────────────
    'navbar_small_text':    False,
    'footer_small_text':    False,
    'body_small_text':      False,
    'brand_small_text':     False,

    # Light content area, dark sidebar — clean B2B feel
    'brand_colour':         'navbar-danger',   # red brand bar
    'accent':               'accent-danger',   # red accents throughout
    'navbar':               'navbar-white navbar-light', # light top bar
    'no_navbar_border':     True,
    'navbar_fixed':         True,              # sticky top navbar
    'layout_boxed':         False,
    'footer_fixed':         False,
    'sidebar_fixed':        True,              # sticky sidebar
    'sidebar':              'sidebar-dark-danger',  # dark sidebar, red active
    'sidebar_nav_small_text':    False,
    'sidebar_disable_expand':    False,
    'sidebar_nav_child_indent':  True,
    'sidebar_nav_compact_style': False,
    'sidebar_nav_legacy_style':  False,
    'sidebar_nav_flat_style':    True,        # flat style = cleaner look

    # ── Fonts & style ──────────────────────────────────────────────────────────
    'theme':                'default',        # AdminLTE base theme
    'default_theme_mode':   'light',          # fixed light theme (replaces deprecated dark_mode_theme)
    'button_classes': {
        'primary':   'btn-primary',
        'secondary': 'btn-secondary',
        'info':      'btn-info',
        'warning':   'btn-warning',
        'danger':    'btn-danger',
        'success':   'btn-success',
    },
    'actions_sticky_top':   True,             # action bar sticks to top of list
}