"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchEmails = fetchEmails;
exports.testImapConnection = testImapConnection;
const imapflow_1 = require("imapflow");
const mailparser_1 = require("mailparser");
async function fetchEmails(config, limit = 50) {
    const client = new imapflow_1.ImapFlow({
        host: config.host,
        port: config.port,
        secure: config.port === 993,
        auth: {
            user: config.username,
            pass: config.password,
        },
        logger: false,
    });
    const messages = [];
    try {
        await client.connect();
        const lock = await client.getMailboxLock('INBOX');
        try {
            const status = await client.status('INBOX', { messages: true });
            const total = status.messages || 0;
            const startSeq = Math.max(1, total - limit + 1);
            for await (const msg of client.fetch(`${startSeq}:*`, {
                uid: true,
                source: true,
            })) {
                try {
                    const source = msg.source;
                    if (!source)
                        continue;
                    const parsed = await (0, mailparser_1.simpleParser)(source);
                    messages.push({
                        uid: String(msg.uid),
                        subject: parsed.subject || '(Kein Betreff)',
                        from: parsed.from?.text || '',
                        date: parsed.date || new Date(),
                        text: parsed.text || '',
                        html: typeof parsed.html === 'string' ? parsed.html : '',
                    });
                }
                catch {
                    // Einzelne E-Mail-Parse-Fehler überspringen
                }
            }
        }
        finally {
            lock.release();
        }
        await client.logout();
    }
    catch (err) {
        await client.logout().catch(() => { });
        throw err;
    }
    return messages.reverse();
}
async function testImapConnection(config) {
    const client = new imapflow_1.ImapFlow({
        host: config.host,
        port: config.port,
        secure: config.port === 993,
        auth: {
            user: config.username,
            pass: config.password,
        },
        logger: false,
        connectionTimeout: 10000,
    });
    try {
        await client.connect();
        await client.logout();
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=imap.js.map