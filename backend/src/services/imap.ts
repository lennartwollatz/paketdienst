import { ImapFlow } from 'imapflow';
import { simpleParser, ParsedMail } from 'mailparser';

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  data: Buffer;
  sizeBytes: number;
}

export interface EmailMessage {
  /** Eindeutige ID: "<Postfachpfad>/<UID>" */
  uid: string;
  subject: string;
  from: string;
  date: Date;
  text: string;
  html: string;
  attachments: EmailAttachment[];
}

export interface ImapConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface FetchOptions {
  /**
   * Vollsync: maximale Anzahl E-Mails pro Ordner (neueste zuerst).
   * Wird ignoriert, wenn sinceDate gesetzt ist.
   */
  limitPerFolder?: number;
  /**
   * Deltasync: nur E-Mails, die nach diesem Datum eingegangen sind.
   * Wenn gesetzt, wird limitPerFolder ignoriert.
   */
  sinceDate?: Date;
  /**
   * Vom Nutzer explizit gesperrte Ordner (Pfade). Diese werden beim Sync übersprungen.
   */
  blockedFolders?: string[];
}

export interface FolderInfo {
  path: string;
  name: string;
  isBlocked: boolean;
}

/** IMAP-Flags von System-Ordnern, die keine eingehenden Bestellungen enthalten */
const SKIP_FLAGS = new Set([
  '\\Trash', '\\Drafts', '\\Sent', '\\Junk', '\\Spam', '\\Noselect',
]);

const SKIP_NAME_PATTERNS = [
  /trash/i, /deleted/i, /gel[oö]scht/i,
  /draft/i, /entw[uü]rfe?/i,
  /sent/i, /gesendet/i, /outbox/i,
  /junk/i, /spam/i,
];

function shouldSkipFolder(path: string, flags?: Set<string>, blockedFolders?: string[]): boolean {
  if (flags) {
    for (const flag of flags) {
      if (SKIP_FLAGS.has(flag)) return true;
    }
  }
  if (SKIP_NAME_PATTERNS.some(re => re.test(path))) return true;
  if (blockedFolders && blockedFolders.includes(path)) return true;
  return false;
}

function makeClient(config: ImapConfig): ImapFlow {
  return new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.port === 993,
    auth: { user: config.username, pass: config.password },
    logger: false,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
      minVersion: 'TLSv1.2',
    },
  });
}

async function parseMsgToEmailMessage(
  msg: { uid: number; source?: Buffer },
  folderPath: string,
): Promise<EmailMessage | null> {
  try {
    if (!msg.source) return null;
    const parsed: ParsedMail = await simpleParser(msg.source);

    const attachments: EmailAttachment[] = (parsed.attachments || [])
      .filter(a =>
        a.contentType === 'application/pdf' ||
        (a.filename || '').toLowerCase().endsWith('.pdf'),
      )
      .map(a => ({
        filename: a.filename || 'anhang.pdf',
        mimeType: a.contentType || 'application/pdf',
        data: Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content),
        sizeBytes: a.size || 0,
      }));

    return {
      uid: `${folderPath}/${msg.uid}`,
      subject: parsed.subject || '(Kein Betreff)',
      from: parsed.from?.text || '',
      date: parsed.date || new Date(),
      text: parsed.text || '',
      html: typeof parsed.html === 'string' ? parsed.html : '',
      attachments,
    };
  } catch {
    return null;
  }
}

/**
 * Liest E-Mails aus ALLEN relevanten Postfächern.
 *
 * - Vollsync (kein sinceDate): letzten `limitPerFolder` E-Mails je Ordner
 * - Deltasync (sinceDate gesetzt): nur neue E-Mails via IMAP SEARCH SINCE
 */
export async function fetchEmails(
  config: ImapConfig,
  options: FetchOptions = {},
): Promise<EmailMessage[]> {
  const { limitPerFolder = 200, sinceDate, blockedFolders } = options;
  const isDelta = !!sinceDate;

  const client = makeClient(config);
  const messages: EmailMessage[] = [];

  try {
    await client.connect();

    const mailboxes = await client.list();
    const foldersToSearch = mailboxes.filter(
      mb => mb.subscribed !== false &&
            !shouldSkipFolder(mb.path, mb.flags as unknown as Set<string>, blockedFolders),
    );

    console.log(
      `IMAP [${isDelta ? 'Delta' : 'Voll'}sync]: ${foldersToSearch.length}/${mailboxes.length} Ordner werden durchsucht` +
      (isDelta ? ` (seit ${sinceDate!.toISOString()})` : ` (max. ${limitPerFolder} je Ordner)`),
    );

    for (const folder of foldersToSearch) {
      let lock;
      try {
        lock = await client.getMailboxLock(folder.path);
      } catch {
        continue;
      }

      try {
        if (isDelta) {
          // ── Delta: IMAP SEARCH SINCE ──────────────────────────────────────
          const uids = await client.search({ since: sinceDate }, { uid: true });

          if (!uids || uids.length === 0) continue;

          for await (const msg of client.fetch(uids, { uid: true, source: true }, { uid: true })) {
            const email = await parseMsgToEmailMessage(
              { uid: msg.uid, source: msg.source },
              folder.path,
            );
            if (email) messages.push(email);
          }
        } else {
          // ── Vollsync: letzte N E-Mails per Sequenz ────────────────────────
          const status = await client.status(folder.path, { messages: true });
          const total = status.messages || 0;
          if (total === 0) continue;

          const startSeq = Math.max(1, total - limitPerFolder + 1);

          for await (const msg of client.fetch(`${startSeq}:*`, { uid: true, source: true })) {
            const email = await parseMsgToEmailMessage(
              { uid: msg.uid, source: msg.source },
              folder.path,
            );
            if (email) messages.push(email);
          }
        }
      } finally {
        lock.release();
      }
    }

    await client.logout();
  } catch (err) {
    await client.logout().catch(() => {});
    throw err;
  }

  return messages.sort((a, b) => b.date.getTime() - a.date.getTime());
}

// ─── Ordnerliste ──────────────────────────────────────────────────────────────

/**
 * Gibt alle IMAP-Ordner zurück (außer Systemordner wie Trash, Sent, etc.).
 * `isBlocked` zeigt an, ob der Ordner in der übergebenen blockedFolders-Liste steht.
 */
export async function listFolders(
  config: ImapConfig,
  blockedFolders: string[] = [],
): Promise<FolderInfo[]> {
  const client = makeClient(config);
  try {
    await client.connect();
    const mailboxes = await client.list();
    await client.logout();

    return mailboxes
      .filter(mb => mb.subscribed !== false)
      .map(mb => ({
        path: mb.path,
        name: mb.name || mb.path,
        isBlocked: blockedFolders.includes(mb.path),
      }));
  } catch (err) {
    await client.logout().catch(() => {});
    throw err;
  }
}

// ─── Verbindungstest ──────────────────────────────────────────────────────────

export interface ImapTestResult {
  success: boolean;
  error?: string;
  hint?: string;
}

export const FIREWALL_HINT =
  'Port 993 (IMAP) wird durch deine Firewall oder dein Netzwerk blockiert. ' +
  'Mögliche Lösungen: (1) Teste mit einem mobilen Hotspot statt WLAN/LAN. ' +
  '(2) Prüfe die Windows-Firewall: Systemsteuerung → Windows Defender Firewall → ' +
  'Erweiterte Einstellungen → Ausgehende Regeln → Port 993 erlauben. ' +
  '(3) Frage deinen Netzwerkadministrator, ob ausgehende Verbindungen auf Port 993/143 erlaubt sind.';

const PROVIDER_HINTS: Record<string, string> = {
  'imap.web.de':
    'WEB.DE benötigt ein App-Passwort (nicht das normale Konto-Passwort): ' +
    'WEB.DE → Einstellungen → Sicherheit → "Externe Programme (POP3 & IMAP)" → App-Passwort erstellen.',
  'imap.gmx.net':
    'GMX benötigt ein App-Passwort: GMX → Einstellungen → Sicherheit → ' +
    '"Externe Programme (POP3 & IMAP)" → App-Passwort erstellen.',
  'imap.gmail.com':
    'Gmail erfordert ein App-Passwort: Google-Konto → Sicherheit → ' +
    '2-Faktor-Authentifizierung → App-Passwörter → "E-Mail" auswählen.',
  'outlook.office365.com':
    'Bei aktivierter 2FA: account.microsoft.com → Sicherheit → App-Passwörter erstellen.',
  'imap.mail.yahoo.com':
    'Yahoo erfordert ein App-Passwort: Yahoo-Konto → Sicherheit → App-Passwörter.',
};

export async function testImapConnection(config: ImapConfig): Promise<ImapTestResult> {
  const client = makeClient(config);

  try {
    await client.connect();
    const mailboxes = await client.list();
    const count = mailboxes.filter(
      mb => !shouldSkipFolder(mb.path, mb.flags as unknown as Set<string>),
    ).length;
    console.log(`IMAP-Test erfolgreich: ${count} durchsuchbare Postfächer gefunden`);
    await client.logout();
    return { success: true };
  } catch (err) {
    let message = '';
    if (err instanceof Error) {
      message = err.message || '';
      const extra = (err as unknown as Record<string, unknown>);
      if (!message && extra.response) message = String(extra.response);
      if (!message && extra.serverResponse) message = String(extra.serverResponse);
      if (!message && extra.code) message = String(extra.code);
    } else {
      message = String(err);
    }

    const hint = PROVIDER_HINTS[config.host.toLowerCase()];
    console.error(`IMAP-Verbindungsfehler (${config.host}):`, JSON.stringify(err, Object.getOwnPropertyNames(err)));

    const subErrors: string[] = [];
    const aggErrors = (err as unknown as Record<string, unknown>).errors;
    if (Array.isArray(aggErrors)) {
      for (const sub of aggErrors) {
        const subCode = (sub as Record<string, unknown>).code;
        if (subCode) subErrors.push(String(subCode));
      }
    }
    const allCodes = [message, ...subErrors].join(' ');

    let userError = `Verbindung zu ${config.host} fehlgeschlagen`;

    if (/auth|login|credential|password|AUTHENTICATIONFAILED|NO \[AUTH|Invalid credentials/i.test(allCodes)) {
      userError = 'Benutzername oder Passwort falsch';
    } else if (/ETIMEDOUT|ECONNREFUSED|ENETUNREACH/i.test(allCodes)) {
      userError = `Port ${config.port} ist durch eine Firewall blockiert`;
    } else if (/ENOTFOUND/i.test(allCodes)) {
      userError = `IMAP-Server "${config.host}" nicht gefunden – Hostname prüfen`;
    } else if (/certificate|SSL|TLS|self.signed/i.test(allCodes)) {
      userError = 'SSL/TLS-Fehler bei der Verbindung';
    } else if (!message || message === '{}') {
      userError = 'Verbindung fehlgeschlagen – IMAP möglicherweise deaktiviert';
    }

    return { success: false, error: userError, hint };
  }
}
