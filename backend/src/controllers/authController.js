import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { signToken } from '../utils/jwt.js';

export async function register(req, res) {
  const { name, email, password, skills = [] } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'name, email and password are required' });
  }

  const existing = await User.findOne({ email });
  if (existing) {
    return res.status(409).json({ message: 'Email already registered' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, passwordHash, skills, role: 'user' });
  const token = signToken({ userId: user._id, role: normalizeRole(user.role), email: user.email });

  return res.status(201).json({
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      skills: user.skills,
      trustScore: user.trustScore,
      verified: user.verified,
      role: normalizeRole(user.role),
    },
  });
}

export async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'email and password are required' });
  }

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  if (user.suspended) {
    return res.status(403).json({ message: 'Account suspended' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = signToken({ userId: user._id, role: normalizeRole(user.role), email: user.email });

  return res.json({
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      skills: user.skills,
      trustScore: user.trustScore,
      verified: user.verified,
      role: normalizeRole(user.role),
    },
  });
}

function normalizeRole(role) {
  if (role === 'admin') {
    return 'admin';
  }
  return 'user';
}
