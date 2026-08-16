from rest_framework.permissions import BasePermission


class IsSuperUser(BasePermission):
    """
    Gate the custom admin API to superusers only. The frontend /admin panel and
    every write endpoint sit behind this — matching "only superuser mails get in".
    """
    message = 'Superuser access is required for the admin panel.'

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_superuser)
