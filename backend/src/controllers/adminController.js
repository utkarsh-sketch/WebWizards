import { fetchAdminMetrics } from '../services/metricsService.js';

export async function getMetrics(_req, res) {
  const metrics = await fetchAdminMetrics();
  return res.json({ metrics });
}
