import express from 'express';
import { updateProfile } from '../controllers/user.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

router.patch('/profile', authenticate, updateProfile);

export default router;
