import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status     = error.response?.status;
    const requestUrl = error.config?.url ?? '';

    const isAuthEndpoint =
      requestUrl.includes('auth/token') || requestUrl.includes('auth/logout');

    if (status === 401 && !isAuthEndpoint) {
      localStorage.clear();
      window.location.replace('/login');
    }

    return Promise.reject(error);
  }
);

export default api;