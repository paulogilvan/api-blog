import express from 'express';
import { UPLOADS_PUBLIC_PATH } from './dtos/upload-url.ts';
import { env } from './env.ts';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.ts';
import { routes } from './routes/index.ts';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());

  // Imagens processadas (sempre WebP gerado pelo servidor). `nosniff` impede o navegador de
  // interpretar o arquivo como outro tipo; sem listagem de diretório nem dotfiles.
  app.use(
    UPLOADS_PUBLIC_PATH,
    express.static(env.UPLOAD_DIR, {
      index: false,
      dotfiles: 'ignore',
      fallthrough: true,
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    }),
  );

  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
