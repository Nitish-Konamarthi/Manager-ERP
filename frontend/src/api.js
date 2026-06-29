import axios from 'axios';

const api = axios.create({ baseURL: '/api/v1', timeout: 15000 });

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
let failedQueue = [];

function processQueue(error, token = null) {
  failedQueue.forEach(({ resolve, reject }) => error ? reject(error) : resolve(token));
  failedQueue = [];
}

api.interceptors.response.use(
  res => {
    if (res.data && res.data.success === true && Object.prototype.hasOwnProperty.call(res.data, 'data')) {
      const d = res.data.data;
      if (d === null || d === undefined) return { ...res, data: [] };
      if (typeof d === 'object' && !Array.isArray(d) && Array.isArray(d.items)) {
        return { ...res, data: d.items };
      }
      return { ...res, data: d };
    }
    return res;
  },
  async err => {
    const originalRequest = err.config;
    if (err.response?.status === 401 && !originalRequest?._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }
      originalRequest._retry = true;
      isRefreshing = true;
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const res = await axios.post('/api/v1/auth/refresh', { refreshToken }, { timeout: 15000 });
          const { accessToken, refreshToken: newRefresh } = res.data?.data || res.data;
          localStorage.setItem('token', accessToken);
          if (newRefresh) localStorage.setItem('refreshToken', newRefresh);
          processQueue(null, accessToken);
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        } catch {
          localStorage.removeItem('token');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
          if (window.location.pathname !== '/login') window.location.href = '/login';
          processQueue(err, null);
          return Promise.reject(err);
        } finally {
          isRefreshing = false;
        }
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        if (window.location.pathname !== '/login') window.location.href = '/login';
        return Promise.reject(err);
      }
    }
    return Promise.reject(err);
  }
);

export default api;
