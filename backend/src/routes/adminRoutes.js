import { Router } from 'express';
import { getMetrics } from '../controllers/adminController.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/metrics', requireAuth, requireAdmin, getMetrics);

export default router;
