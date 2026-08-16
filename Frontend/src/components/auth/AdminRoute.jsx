import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';

/**
 * Gates the custom /admin panel to superusers only. The backend enforces the
 * same rule (IsSuperUser on every admin API endpoint) — this guard is just so
 * non-superusers never see the UI.
 */
const AdminRoute = ({ children }) => {
  const { isAuthenticated, isSuperuser } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (!isSuperuser) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

export default AdminRoute;
