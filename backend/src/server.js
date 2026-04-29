import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

import { env, isProduction } from './config/env.js';
import apiRoutes from './routes/index.js';
import { tratadorDeErros } from './middleware/error.middleware.js';
import { iniciarAgendadorAsaas, pararAgendadorAsaas, iniciarAgendadorNotificacoes, pararAgendadorNotificacoes, iniciarAgendadorRecorrencias, pararAgendadorRecorrencias } from './services/scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Segurança básica.
// "contentSecurityPolicy: false" porque o Vite injeta scripts inline
// na página servida em produção; vamos tratar CSP de forma mais fina depois.
app.use(helmet({ contentSecurityPolicy: false }));

// CORS — em dev liberamos a origem do Vite; em prod o frontend é servido
// pelo mesmo host, então não precisa de CORS, mas mantemos a opção.
app.use(
  cors({
    origin: env.CORS_ORIGIN ? env.CORS_ORIGIN.split(',') : true,
    credentials: true,
  }),
);

app.use(express.json({ limit: '1mb' }));

// Rotas da API
app.use('/api', apiRoutes);

// Em produção, servimos o build do frontend.
// O build do Vite vai parar em ../../frontend/dist (caminho relativo a este arquivo).
//
// Importante: NUNCA confiamos só em NODE_ENV pra decidir servir o frontend.
// Se o dist existe, servimos. Isso evita um problema clássico de deploy onde
// NODE_ENV não foi setado e o usuário vê "Cannot GET /".
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
const frontendDistExiste = existsSync(frontendDist);

if (frontendDistExiste) {
  console.log(`[server] Servindo frontend de ${frontendDist}`);
  app.use(express.static(frontendDist));

  // SPA fallback: qualquer rota que não seja /api devolve o index.html.
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  console.warn(
    `[server] Build do frontend não encontrado em ${frontendDist}. ` +
      'Em desenvolvimento isso é normal (use o Vite). ' +
      'Em produção, rode "npm run build" antes de iniciar.',
  );

  // Mensagem amigável pra raiz quando não tem frontend buildado — evita
  // o "Cannot GET /" feio do Express.
  if (isProduction) {
    app.get('/', (_req, res) => {
      res.status(503).type('text/plain').send(
        'Backend rodando, mas frontend não encontrado.\n\n' +
        `Esperado em: ${frontendDist}\n` +
        'Verifique se o build do frontend rodou e foi incluído na imagem.',
      );
    });
  }
}

// Tratador de erros sempre por último.
app.use(tratadorDeErros);

const server = app.listen(env.PORT, () => {
  console.log(`[server] Backend ouvindo em http://localhost:${env.PORT} (${env.NODE_ENV})`);
  iniciarAgendadorAsaas();
  iniciarAgendadorNotificacoes();
  iniciarAgendadorRecorrencias();
});

// Encerramento gracioso.
function shutdown(signal) {
  console.log(`[server] Recebido ${signal}, encerrando...`);
  pararAgendadorAsaas();
  pararAgendadorNotificacoes();
  pararAgendadorRecorrencias();
  server.close(() => process.exit(0));
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
