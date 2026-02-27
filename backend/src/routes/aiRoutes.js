import { Router } from 'express';
import { getCrisisAssist } from '../controllers/aiController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/crisis-assist', requireAuth, getCrisisAssist);

export default router;
