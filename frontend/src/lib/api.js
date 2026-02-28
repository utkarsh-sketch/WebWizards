const API_BASE = import.meta.env.VITE_API_URL;

if (!API_BASE) {
  throw new Error("VITE_API_URL is not defined");
}

async function request(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }

  return data;
}

export const api = {
  apiBase: API_BASE,
  register: (payload) => request('/api/auth/register', { method: 'POST', body: payload }),
  login: (payload) => request('/api/auth/login', { method: 'POST', body: payload }),
  getActiveSos: (token) => request('/api/sos/active', { token }),
  getMySos: (token) => request('/api/sos/mine', { token }),
  getSosStats: (token) => request('/api/sos/stats', { token }),
  createSos: (token, payload) => request('/api/sos', { method: 'POST', token, body: payload }),
  respondToSos: (token, id, payload = {}) => request(`/api/sos/${id}/respond`, { method: 'PATCH', token, body: payload }),
  resolveSos: (token, id, note) => request(`/api/sos/${id}/resolve`, { method: 'PATCH', token, body: { note } }),
  getAdminMetrics: (token) => request('/api/admin/metrics', { token }),
  getCrisisAssist: (token, payload) => request('/api/ai/crisis-assist', { method: 'POST', token, body: payload }),
};
