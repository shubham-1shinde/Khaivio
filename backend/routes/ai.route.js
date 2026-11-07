import express from 'express';
import { getReorderSuggestions } from '../controllers/ai.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get(
    '/reorder-suggestions',
    authenticate,
    getReorderSuggestions
);

export default router;