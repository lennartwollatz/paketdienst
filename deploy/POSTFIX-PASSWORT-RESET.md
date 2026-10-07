# Postfix + Passwort-Reset (Paketdienst)

Die App baut den Link in **`backend/src/services/mailer.ts`**:

`{FRONTEND_URL}/reset-password?token=…`

Beispiel Produktion:

`https://wollatzsmarthome.ddns.net/paketdienst/reset-password?token=…`

---

## 1. App konfigurieren (`backend/.env`)

```env
FRONTEND_URL=https://wollatzsmarthome.ddns.net/paketdienst

SMTP_HOST=127.0.0.1
SMTP_PORT=25
SMTP_FROM=noreply@wollatzsmarthome.ddns.net
# Kein SMTP_USER / SMTP_PASS nötig für lokales Postfix
```

Danach Backend neu starten:

```bash
sudo systemctl restart paketdienst-api
```

---

## 2. Postfix installieren (Debian / Raspberry Pi OS / Ubuntu)

```bash
sudo apt update
sudo apt install -y postfix mailutils
```

Beim Dialog **„General mail configuration“**:

- **Internet Site** (oder „Satellite system“, wenn du später einen Smarthost nutzt)
- **System mail name:** `wollatzsmarthome.ddns.net` (dein Hostname, unter dem du mailen willst)

Prüfen:

```bash
systemctl status postfix
sudo postfix status
```

Test-Mail an dich selbst:

```bash
echo "Postfix-Test" | mail -s "Test von $(hostname)" deine@gmail.com
sudo tail -f /var/log/mail.log
```

---

## 3. Postfix nach **extern** senden (Gmail, GMX, …)

**Wichtig:** `inet_interfaces = loopback-only` bedeutet nur: **niemand aus dem Internet** darf bei dir SMTP einliefern. **Postfix darf trotzdem selbst** Mails nach draußen schicken (Port 25/587 **ausgehend**).

### Schnellsetup (Skript)

```bash
cd /var/www/paketdienst
git pull
chmod +x deploy/setup-postfix-external.sh
sudo ./deploy/setup-postfix-external.sh
```

### Manuell

```bash
echo wollatzsmarthome.ddns.net | sudo tee /etc/mailname
```

Werte aus **`deploy/postfix-main.cf.snippet`** in **`/etc/postfix/main.cf`** übernehmen (oder anpassen), dann:

```bash
sudo postfix check
sudo systemctl reload postfix
```

### Test extern

```bash
echo "Extern-Test $(date)" | mail -s "Paketdienst Postfix" deine@gmail.com
sudo tail -30 /var/log/mail.log
```

Erfolg in den Logs: `status=sent` mit `relay=…gmail…`.  
Fehler `Connection timed out` / `Network is unreachable` → oft **ISP blockiert ausgehend Port 25** → Abschnitt 4 (Smarthost).

### Firewall (falls ufw aktiv)

Ausgehend ist meist erlaubt. **Eingehend** Port 25 muss **nicht** offen sein (loopback-only).

---

## 4. Zustellung an Gmail & Co. (wichtig)

Von einer **Heim-IP** ohne DNS-Einträge landen Mails oft im **Spam** oder werden **abgelehnt**.

Empfohlen (mindestens):

1. **SPF** — TXT bei deiner Domain, z. B.  
   `v=spf1 ip4:DEINE_FESTE_IP -all`  
   (oder `a: wollatzsmarthome.ddns.net` wenn A-Record passt)

2. **Absender** — `SMTP_FROM` sollte zu deiner Domain passen (`noreply@wollatzsmarthome.ddns.net`).

3. **Optional DKIM** — `opendkim` + Postfix (aufwendiger, bessere Zustellung).

4. **Smarthost (wenn Port 25 blockiert)** — typisch bei Kabel/DSL:

   ```bash
   sudo nano /etc/postfix/sasl_passwd
   ```

   Inhalt (Beispiel):

   ```
   [smtp.dein-provider.de]:587    dein-login:dein-passwort
   ```

   ```bash
   sudo chmod 600 /etc/postfix/sasl_passwd
   sudo postmap /etc/postfix/sasl_passwd
   ```

   In **`main.cf`**:

   ```ini
   relayhost = [smtp.dein-provider.de]:587
   smtp_sasl_auth_enable = yes
   smtp_sasl_password_maps = hash:/etc/postfix/sasl_passwd
   smtp_sasl_security_options = noanonymous
   smtp_tls_security_level = encrypt
   ```

   ```bash
   sudo postfix check && sudo systemctl reload postfix
   ```

   Die App bleibt unverändert bei `SMTP_HOST=127.0.0.1` — Postfix leitet über den Smarthost weiter.

Ohne SPF/Relay: Postfix **läuft**, Link in der Mail ist **korrekt**, Zustellung kann trotzdem scheitern — Logs prüfen.

---

## 5. App testen

1. In der Paketdienst-App **Passwort vergessen** mit einer **registrierten** E-Mail.
2. Logs Backend:

   ```bash
   sudo journalctl -u paketdienst-api -f
   ```

3. Postfix:

   ```bash
   sudo tail -f /var/log/mail.log
   ```

4. Link in der Mail sollte mit **`/paketdienst/reset-password?token=`** beginnen.

---

## 6. Alternative ohne eigenen Postfix

Gmail **App-Passwort** (2FA aktiv):

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=deine@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx
SMTP_FROM=deine@gmail.com
```

Kein Postfix nötig; oft zuverlässiger für private Nutzer.

---

## Fehler

| Symptom | Typische Ursache |
|--------|-------------------|
| 500 „Fehler beim Senden der E-Mail“ | Postfix nicht aktiv, Port 25 blockiert, `journalctl -u paketdienst-api` |
| Mail kommt nicht an | Spam, SPF fehlt, Relay nötig — `mail.log` |
| Link 404 | `FRONTEND_URL` ohne `/paketdienst` oder Nginx falsch |
| Link geht zu localhost | `FRONTEND_URL` in `.env` noch Dev-URL |
