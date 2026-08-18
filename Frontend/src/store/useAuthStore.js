import { create } from 'zustand';
import api from '../api/axios';
import { jwtDecode } from 'jwt-decode';

const decodeToken = (token) => {
  try {
    return jwtDecode(token);
  } catch {
    return null;
  }
};

const getInitialAuthState = () => {
  const token = localStorage.getItem('accessToken');
  if (!token) return { user: null, isAuthenticated: false, isAgent: false, impersonatedBuyer: null };
  const decoded = decodeToken(token);
  if (!decoded || decoded.exp * 1000 < Date.now()) {
    localStorage.clear();
    return { user: null, isAuthenticated: false, isAgent: false, isSuperuser: false, impersonatedBuyer: null };
  }
  return { user: decoded, isAuthenticated: true, isAgent: decoded.is_agent ?? false, isSuperuser: decoded.is_superuser ?? false, impersonatedBuyer: null };
};

export const useAuthStore = create((set, _get) => ({
  ...getInitialAuthState(),

  initAuth: () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      set({ user: null, isAuthenticated: false, isAgent: false, impersonatedBuyer: null });
      return;
    }
    const decoded = decodeToken(token);
    if (!decoded || decoded.exp * 1000 < Date.now()) {
      localStorage.clear();
      set({ user: null, isAuthenticated: false, isAgent: false, impersonatedBuyer: null });
      return;
    }
    set({
      user:            decoded,
      isAuthenticated: true,
      isAgent:         decoded.is_agent ?? false,
      isSuperuser:     decoded.is_superuser ?? false,
    });
  },

  login: async (email, password) => {
    const res     = await api.post('auth/token/', { email, password });
    localStorage.setItem('accessToken',  res.data.access);
    localStorage.setItem('refreshToken', res.data.refresh);
    const decoded = decodeToken(res.data.access);
    set({
      user:            decoded,
      isAuthenticated: true,
      isAgent:         decoded?.is_agent ?? false,
      isSuperuser:     decoded?.is_superuser ?? false,
    });
    return decoded;
  },

  logout: async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      try {
        await api.post('auth/logout/', { refresh: refreshToken });
      } catch {
        // always clear locally
      }
    }
    localStorage.clear();
    set({ user: null, isAuthenticated: false, isAgent: false, impersonatedBuyer: null });
    window.location.replace('/login');
  },

  setImpersonatedBuyer: (buyer) => set({ impersonatedBuyer: buyer }),
  clearImpersonatedBuyer: () => set({ impersonatedBuyer: null }),
}));