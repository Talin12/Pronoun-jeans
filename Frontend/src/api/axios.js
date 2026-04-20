import axios from 'axios';

// While running locally, use localhost. 
// When you deploy the backend to Railway, change this to your Railway URL.
const api = axios.create({
  baseURL: 'http://localhost:8000/api/',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;