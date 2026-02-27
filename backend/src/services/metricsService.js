import { SOS } from '../models/SOS.js';
import { Report } from '../models/Report.js';
import { User } from '../models/User.js';

export async function fetchAdminMetrics() {
  const [activeIncidents, resolvedToday, pendingReports, suspendedUsers, verifiedResponders] = await Promise.all([
    SOS.countDocuments({ status: 'active' }),
    SOS.countDocuments({ status: 'resolved', resolvedAt: { $gte: startOfDayUtc() } }),
    Report.countDocuments({ resolved: false }),
    User.countDocuments({ suspended: true }),
    User.countDocuments({ verified: true }),
  ]);

  return {
    activeIncidents,
    resolvedToday,
    pendingReports,
    suspendedUsers,
    verifiedResponders,
    generatedAt: new Date().toISOString(),
  };
}

function startOfDayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
