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
/**
 * Liest E-Mails aus ALLEN relevanten Postfächern.
 *
 * - Vollsync (kein sinceDate): letzten `limitPerFolder` E-Mails je Ordner
 * - Deltasync (sinceDate gesetzt): nur neue E-Mails via IMAP SEARCH SINCE
 */
export declare function fetchEmails(config: ImapConfig, options?: FetchOptions): Promise<EmailMessage[]>;
/**
 * Gibt alle IMAP-Ordner zurück (außer Systemordner wie Trash, Sent, etc.).
 * `isBlocked` zeigt an, ob der Ordner in der übergebenen blockedFolders-Liste steht.
 */
export declare function listFolders(config: ImapConfig, blockedFolders?: string[]): Promise<FolderInfo[]>;
export interface ImapTestResult {
    success: boolean;
    error?: string;
    hint?: string;
}
export declare const FIREWALL_HINT: string;
export declare function testImapConnection(config: ImapConfig): Promise<ImapTestResult>;
//# sourceMappingURL=imap.d.ts.map