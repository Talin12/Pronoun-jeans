import { create } from 'zustand';
import api from '../api/axios';
import { jwtDecode } from 'jwt-decode';

export const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('accessToken'),

  login: async (email, password) => {
    const res = await api.post('auth/token/', { email, password });
    localStorage.setItem('accessToken', res.data.access);
    localStorage.setItem('refreshToken', res.data.refresh);
    const decoded = jwtDecode(res.data.access);
    set({ user: decoded, isAuthenticated: true });
  },

  logout: () => {
    localStorage.clear();
    set({ user: null, isAuthenticated: false });
  },
}));