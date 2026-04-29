import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requirePayment, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// GET /api/attachments/order/:orderId  – Metadaten aller Anhänge einer Bestellung
router.get('/order/:orderId', requireAuth, requirePayment, async (req: AuthRequest, res: Response) => {
  const orderId = String(req.params.orderId);
  const userId = String(req.user!.id);

  const order = await prisma.order.findFirst({ where: { id: orderId, userId } });
  if (!order) return res.status(404).json({ error: 'Bestellung nicht gefunden' });

  const attachments = await prisma.orderAttachment.findMany({
    where: { orderId },
    select: { id: true, filename: true, mimeType: true, sizeBytes: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  return res.json(attachments);
});

// GET /api/attachments/:id  – Datei herunterladen
router.get('/:id', requireAuth, requirePayment, async (req: AuthRequest, res: Response) => {
  const attachmentId = String(req.params.id);
  const userId = String(req.user!.id);

  const attachment = await prisma.orderAttachment.findUnique({
    where: { id: attachmentId },
    include: { order: { select: { userId: true } } },
  });

  if (!attachment) return res.status(404).json({ error: 'Anhang nicht gefunden' });
  if (attachment.order.userId !== userId) return res.status(403).json({ error: 'Nicht autorisiert' });

  const inline = req.query.inline === 'true';

  res.setHeader('Content-Type', attachment.mimeType);
  res.setHeader('Content-Length', attachment.sizeBytes);
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(attachment.filename)}"`
  );

  return res.send(attachment.data);
});

export default router;
