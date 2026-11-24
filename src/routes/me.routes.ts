import { Router } from 'express';
import { updateAvatarController } from '../controllers/me.controller.ts';
import { ensureAuthenticated } from '../middlewares/ensure-authenticated.ts';
import { singleImage } from '../middlewares/upload.ts';

export const meRoutes = Router();

// Autenticação antes do upload: requisição sem token é rejeitada sem ler o arquivo.
meRoutes.put('/avatar', ensureAuthenticated, singleImage(), updateAvatarController);
