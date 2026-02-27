import { Router } from 'express';
import { createSos, getActiveSos, getMySos, getSosStats, resolveSos, respondToSos } from '../controllers/sosController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/active', requireAuth, getActiveSos);
router.get('/mine', requireAuth, getMySos);
router.get('/stats', requireAuth, getSosStats);
router.post('/', requireAuth, createSos);
router.patch('/:id/respond', requireAuth, respondToSos);
router.patch('/:id/resolve', requireAuth, resolveSos);

export default router;
