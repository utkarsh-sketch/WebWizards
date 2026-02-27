import { SOS } from '../models/SOS.js';
import { ResponseLog } from '../models/ResponseLog.js';
import { User } from '../models/User.js';
import { getIo } from '../socket/io.js';
import { fetchAdminMetrics } from '../services/metricsService.js';
import { getConnectedUsersCount } from '../socket/presence.js';
import { sendEmail } from '../services/emailService.js';

export async function createSos(req, res) {
  const { crisisType, lat, lng, address = '', radiusMeters, description = '', anonymous = false } = req.body;

  if (!crisisType || typeof lat !== 'number' || typeof lng !== 'number' || !radiusMeters) {
    return res.status(400).json({ message: 'crisisType, lat, lng and radiusMeters are required' });
  }

  const sos = await SOS.create({
    crisisType,
    description,
    location: {
      type: 'Point',
      coordinates: [lng, lat],
      address,
    },
    radiusMeters,
    createdBy: req.user.userId,
    anonymous,
  });

  const populated = await SOS.findById(sos._id)
    .populate('responders', 'name skills trustScore verified')
    .populate('responderLocations.responder', 'name')
    .populate('createdBy', 'name email');

  const io = getIo();
  io?.emit('sos:new', normalizeSos(populated));
  io?.emit('admin:metrics_updated', await fetchAdminMetrics());
  notifyConnectedUsersOnNewSos(populated, req.user.userId).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('Email alert task failed:', err.message);
  });

  return res.status(201).json({ sos: normalizeSos(populated) });
}

export async function getActiveSos(req, res) {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const maxDistance = Number(req.query.maxDistance || 2000);

  const filter = { status: 'active' };

  if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
    filter.location = {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [lng, lat],
        },
        $maxDistance: maxDistance,
      },
    };
  }

  const incidents = await SOS.find(filter)
    .sort({ createdAt: -1 })
    .limit(100)
    .populate('responders', 'name skills trustScore verified')
    .populate('responderLocations.responder', 'name')
    .populate('createdBy', 'name email');

  return res.json({ incidents: incidents.map(normalizeSos) });
}

export async function getMySos(req, res) {
  const incidents = await SOS.find({ createdBy: req.user.userId })
    .sort({ createdAt: -1 })
    .limit(200)
    .populate('responders', 'name skills trustScore verified')
    .populate('responderLocations.responder', 'name')
    .populate('createdBy', 'name email');

  return res.json({ incidents: incidents.map(normalizeSos) });
}

export async function getSosStats(_req, res) {
  const [activeIncidents, resolvedToday] = await Promise.all([
    SOS.countDocuments({ status: 'active' }),
    SOS.countDocuments({ status: 'resolved', resolvedAt: { $gte: startOfDayUtc() } }),
  ]);

  return res.json({
    stats: {
      activeUsers: getConnectedUsersCount(),
      activeIssues: activeIncidents,
      resolvedToday,
    },
  });
}

export async function respondToSos(req, res) {
  const { id } = req.params;
  const { lat, lng } = req.body;

  const sos = await SOS.findById(id);
  if (!sos || sos.status !== 'active') {
    return res.status(404).json({ message: 'Active SOS not found' });
  }

  const isCreator = sos.createdBy.toString() === req.user.userId;
  if (isCreator && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Creator cannot respond to own SOS' });
  }

  const alreadyResponder = sos.responders.some((responderId) => responderId.toString() === req.user.userId);
  if (!alreadyResponder) {
    sos.responders.push(req.user.userId);
  }

  const hasLocationPayload = Number.isFinite(lat) && Number.isFinite(lng);
  if (hasLocationPayload) {
    const locationEntry = sos.responderLocations.find((entry) => entry.responder.toString() === req.user.userId);

    if (locationEntry) {
      locationEntry.location = { type: 'Point', coordinates: [lng, lat] };
      locationEntry.updatedAt = new Date();
    } else {
      sos.responderLocations.push({
        responder: req.user.userId,
        location: { type: 'Point', coordinates: [lng, lat] },
        updatedAt: new Date(),
      });
    }
  }

  await sos.save();

  if (!alreadyResponder) {
    await ResponseLog.create({ sosId: sos._id, responderId: req.user.userId, action: 'joined' });
  } else if (hasLocationPayload) {
    await ResponseLog.create({ sosId: sos._id, responderId: req.user.userId, action: 'status_update', note: 'Location updated' });
  }

  const populated = await SOS.findById(sos._id)
    .populate('responders', 'name skills trustScore verified')
    .populate('responderLocations.responder', 'name')
    .populate('createdBy', 'name email');

  const io = getIo();
  io?.emit('sos:responder_joined', normalizeSos(populated));
  io?.emit('sos:updated', normalizeSos(populated));

  return res.json({ sos: normalizeSos(populated) });
}

export async function resolveSos(req, res) {
  const { id } = req.params;
  const { note = '' } = req.body;

  const sos = await SOS.findById(id);
  if (!sos || sos.status !== 'active') {
    return res.status(404).json({ message: 'Active SOS not found' });
  }

  const isCreator = sos.createdBy.toString() === req.user.userId;
  const isResponder = sos.responders.some((r) => r.toString() === req.user.userId);
  if (!isCreator && !isResponder && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Not allowed to resolve this SOS' });
  }

  // If creator closes without participating as a responder, mark as cancelled.
  // This avoids counting self-closed incidents as successful resolutions.
  const creatorClosingOwnRequest = isCreator && !isResponder && req.user.role !== 'admin';
  if (creatorClosingOwnRequest) {
    sos.status = 'cancelled';
    sos.resolvedAt = null;
  } else {
    sos.status = 'resolved';
    sos.resolvedAt = new Date();
  }
  await sos.save();

  await ResponseLog.create({
    sosId: sos._id,
    responderId: req.user.userId,
    action: creatorClosingOwnRequest ? 'status_update' : 'resolved',
    note: creatorClosingOwnRequest ? note || 'Closed by creator' : note,
  });

  if (!creatorClosingOwnRequest) {
    await User.updateMany(
      { _id: { $in: sos.responders } },
      [
        {
          $set: {
            trustScore: { $min: [5, { $add: ['$trustScore', 0.1] }] },
          },
        },
      ]
    );
  }

  const populated = await SOS.findById(sos._id)
    .populate('responders', 'name skills trustScore verified')
    .populate('responderLocations.responder', 'name')
    .populate('createdBy', 'name email');

  const io = getIo();
  io?.emit('sos:resolved', normalizeSos(populated));
  io?.emit('sos:updated', normalizeSos(populated));
  io?.emit('admin:metrics_updated', await fetchAdminMetrics());

  return res.json({ sos: normalizeSos(populated) });
}

function normalizeSos(sos) {
  return {
    id: sos._id,
    crisisType: sos.crisisType,
    description: sos.description,
    location: {
      lat: sos.location.coordinates[1],
      lng: sos.location.coordinates[0],
      address: sos.location.address,
    },
    radiusMeters: sos.radiusMeters,
    status: sos.status,
    anonymous: sos.anonymous,
    createdBy: sos.anonymous
      ? { id: null, name: 'Anonymous' }
      : {
          id: sos.createdBy?._id || null,
          name: sos.createdBy?.name || null,
          email: sos.createdBy?.email || null,
        },
    responders:
      sos.responders?.map((responder) => ({
        id: responder._id,
        name: responder.name,
        skills: responder.skills,
        trustScore: responder.trustScore,
        verified: responder.verified,
      })) || [],
    responderLocations:
      sos.responderLocations?.map((entry) => ({
        responderId: entry.responder?._id || entry.responder || null,
        responderName: entry.responder?.name || 'Responder',
        lat: entry.location?.coordinates?.[1] ?? null,
        lng: entry.location?.coordinates?.[0] ?? null,
        updatedAt: entry.updatedAt || null,
      })) || [],
    createdAt: sos.createdAt,
    updatedAt: sos.updatedAt,
    resolvedAt: sos.resolvedAt,
  };
}

function startOfDayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function notifyConnectedUsersOnNewSos(sos, creatorUserId) {
  const users = await User.find(
    { _id: { $ne: creatorUserId }, suspended: false },
    { email: 1, name: 1 }
  ).lean();

  const recipients = users.map((u) => u.email).filter(Boolean);
  if (!recipients.length) {
    return;
  }

  const subject = `NearHelp SOS Alert: ${String(sos.crisisType || 'Emergency').toUpperCase()}`;
  const location = sos.location?.address || `${sos.location?.coordinates?.[1]}, ${sos.location?.coordinates?.[0]}`;
  const text = [
    'A new SOS was raised on NearHelp.',
    `Type: ${sos.crisisType}`,
    `Location: ${location}`,
    `Radius: ${sos.radiusMeters}m`,
    sos.description ? `Details: ${sos.description}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    await sendEmail({
      to: recipients.join(','),
      subject,
      text,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Email alert skipped:', err.message);
  }
}
