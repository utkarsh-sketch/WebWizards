import { Router } from 'express';
import { flagReport, resolveReport } from '../controllers/reportController.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/flag', requireAuth, flagReport);
router.patch('/:id/resolve', requireAuth, requireAdmin, resolveReport);

export default router;
