import nodemailer from 'nodemailer';

function createTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const useAuth = Boolean(user && pass);

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    ...(useAuth ? { auth: { user, pass } } : {}),
    // Lokales Postfix (127.0.0.1:25) ohne TLS
    ...(host === '127.0.0.1' || host === 'localhost' ? { tls: { rejectUnauthorized: false } } : {}),
  });
}

const transporter = createTransporter();

export async function sendPasswordResetEmail(to: string, token: string) {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'noreply@paketdienst.app',
    to,
    subject: 'Passwort zurücksetzen – Paketdienst',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Passwort zurücksetzen</h2>
        <p>Du hast eine Anfrage zum Zurücksetzen deines Passworts gestellt.</p>
        <p>Klicke auf den folgenden Link, um dein Passwort zurückzusetzen (gültig für 1 Stunde):</p>
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: #3b82f6; color: white; text-decoration: none; border-radius: 8px; margin: 16px 0;">
          Passwort zurücksetzen
        </a>
        <p>Falls du diese Anfrage nicht gestellt hast, ignoriere diese E-Mail.</p>
      </div>
    `,
  });
}
