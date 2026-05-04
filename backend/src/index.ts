import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import authRoutes from './routes/auth';
import emailAccountRoutes from './routes/emailAccounts';
import orderRoutes from './routes/orders';
import stripeRoutes from './routes/stripe';
import attachmentRoutes from './routes/attachments';
import { startTrackingPoller } from './services/tracking/poller';
import { startEmailPoller } from './services/emailPoller';

const prisma = new PrismaClient();

const app = express();
const PORT = process.env.PORT || 3001;

function isAllowedCorsOrigin(origin: string): boolean {
  const allowedUrl = process.env.FRONTEND_URL?.trim();
  if (!allowedUrl) return false;
  if (origin === allowedUrl) return true;
  try {
    const requestOrigin = new URL(origin).origin;
    return requestOrigin === new URL(allowedUrl).origin;
  } catch {
    return false;
  }
}

// ── Sicherheits-Header ────────────────────────────────────────────────────────
app.use((_req, res, next) => {
  // Verhindert MIME-Type-Sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Verhindert Einbettung der App in fremde Frames (Clickjacking)
  res.setHeader('X-Frame-Options', 'DENY');
  // Aktiviert XSS-Filter älterer Browser
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Keine Referrer-Informationen an externe Seiten
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // CSP: API-Antworten dürfen nicht als Webseite ausgeführt werden
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'",
  );
  next();
});

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || /^http:\/\/localhost(:\d+)?$/.test(origin)) {
      callback(null, true);
    } else if (isAllowedCorsOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS: Nicht erlaubter Origin'));
    }
  },
  credentials: true,
}));

// Stripe webhook needs raw body
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/email-accounts', emailAccountRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/attachments', attachmentRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Interner Serverfehler', message: err.message });
});

/**
 * Einmalige Nachmigration: Erzeugt für jede Bestellung, die einen emailBody
 * besitzt aber noch keinen OrderEmail-Datensatz hat, einen synthetischen
 * OrderEmail-Eintrag aus den Legacy-Feldern.
 */
async function backfillOrderEmails(): Promise<void> {
  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { emailBody: { not: null } },
        { emailBodyHtml: { not: null } },
      ],
    },
    include: { orderEmails: { take: 1, select: { id: true } } },
  });

  let created = 0;
  for (const order of orders) {
    if (order.orderEmails.length === 0) {
      await prisma.orderEmail.create({
        data: {
          orderId:     order.id,
          subject:     order.subject ?? null,
          fromAddress: null,
          receivedAt:  order.orderDate ?? order.createdAt,
          bodyText:    order.emailBody    ?? null,
          bodyHtml:    order.emailBodyHtml ?? null,
        },
      });
      created++;
    }
  }

  if (created > 0) {
    console.log(`[migration] ${created} fehlende OrderEmail-Einträge nacherstellt.`);
  }
}

app.listen(PORT, async () => {
  console.log(`Server läuft auf Port ${PORT}`);
  await backfillOrderEmails();
  startTrackingPoller();
  startEmailPoller();
});

export default app;
