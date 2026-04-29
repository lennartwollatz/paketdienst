export interface EmailMessage {
    uid: string;
    subject: string;
    from: string;
    date: Date;
    text: string;
    html: string;
}
export interface ImapConfig {
    host: string;
    port: number;
    username: string;
    password: string;
}
export declare function fetchEmails(config: ImapConfig, limit?: number): Promise<EmailMessage[]>;
export declare function testImapConnection(config: ImapConfig): Promise<boolean>;
//# sourceMappingURL=imap.d.ts.map