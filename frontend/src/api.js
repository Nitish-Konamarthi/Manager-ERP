import axios from 'axios';

const api = axios.create({ baseURL: '/api/v1' });

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => {
    if (res.data && res.data.success === true && Object.prototype.hasOwnProperty.call(res.data, 'data')) {
      return { ...res, data: res.data.data };
    }
    return res;
  },
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
