import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const FREE_PROCESSED_ORDERS_LIMIT = Number(process.env.FREE_PROCESSED_ORDERS_LIMIT || 20);

function isProcessedOrderStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const normalized = status.trim().toLowerCase();
  const processedStatuses = new Set([
    'zugestellt',
    'delivered',
    'returned',
    'zurückgesendet',
    'zurueckgesendet',
    'retourniert',
  ]);
  return processedStatuses.has(normalized);
}

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    isTestUser: boolean;
    hasPaymentMethod: boolean;
    stripeSubscriptionId: string | null;
  };
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Nicht autorisiert' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string;
      email: string;
    };

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        isTestUser: true,
        hasPaymentMethod: true,
        stripeSubscriptionId: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'Benutzer nicht gefunden' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      isTestUser: user.isTestUser,
      hasPaymentMethod: user.hasPaymentMethod,
      stripeSubscriptionId: user.stripeSubscriptionId,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Ungültiges Token' });
  }
}

export async function requirePayment(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Nicht autorisiert' });
  }

  if (req.user.isTestUser || req.user.hasPaymentMethod) {
    return next();
  }

  const orders = await prisma.order.findMany({
    where: { userId: req.user.id },
    select: { status: true },
  });
  const processedOrdersCount = orders.filter((order) => isProcessedOrderStatus(order.status)).length;

  if (processedOrdersCount < FREE_PROCESSED_ORDERS_LIMIT) {
    return next();
  }

  return res.status(402).json({
    error: 'Einmalige Zahlung von 10 EUR erforderlich',
    code: 'PAYMENT_REQUIRED',
    freeProcessedOrdersLimit: FREE_PROCESSED_ORDERS_LIMIT,
    processedOrdersCount,
  });
}
