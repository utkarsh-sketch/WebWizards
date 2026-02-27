import { Report } from '../models/Report.js';
import { SOS } from '../models/SOS.js';
import { User } from '../models/User.js';
import { fetchAdminMetrics } from '../services/metricsService.js';
import { getIo } from '../socket/io.js';

export async function flagReport(req, res) {
  const { sosId, reason } = req.body;

  if (!sosId || !reason) {
    return res.status(400).json({ message: 'sosId and reason are required' });
  }

  const sos = await SOS.findById(sosId);
  if (!sos) {
    return res.status(404).json({ message: 'SOS not found' });
  }

  const report = await Report.create({
    sosId,
    reportedBy: req.user.userId,
    reason,
  });

  const io = getIo();
  io?.emit('admin:metrics_updated', await fetchAdminMetrics());

  return res.status(201).json({ report });
}

export async function resolveReport(req, res) {
  const { id } = req.params;
  const { resolutionNote = '', falseAlert = false } = req.body;

  const report = await Report.findById(id);
  if (!report) {
    return res.status(404).json({ message: 'Report not found' });
  }

  if (report.resolved) {
    return res.status(400).json({ message: 'Report already resolved' });
  }

  report.resolved = true;
  report.resolutionNote = resolutionNote;
  await report.save();

  if (falseAlert) {
    const sos = await SOS.findById(report.sosId);
    if (sos) {
      await User.findByIdAndUpdate(sos.createdBy, {
        $inc: { trustScore: -0.5 },
      });

      const creator = await User.findById(sos.createdBy);
      if (creator && creator.trustScore <= 1.5) {
        creator.suspended = true;
        await creator.save();
      }
    }
  }

  const io = getIo();
  io?.emit('admin:metrics_updated', await fetchAdminMetrics());

  return res.json({ report });
}
