#!/usr/bin/env bash
# Postfix für externen Versand vorbereiten (Debian/Ubuntu/Raspberry Pi OS).
# Ausführen auf dem Server: chmod +x deploy/setup-postfix-external.sh && sudo ./deploy/setup-postfix-external.sh
set -euo pipefail

DOMAIN="${MAIL_DOMAIN:-wollatzsmarthome.ddns.net}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Bitte mit sudo ausführen." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y postfix mailutils

echo "$DOMAIN" > /etc/mailname

MAIN=/etc/postfix/main.cf
if ! grep -q '# --- paketdienst external ---' "$MAIN" 2>/dev/null; then
  cat >> "$MAIN" <<EOF

# --- paketdienst external ---
myhostname = $DOMAIN
myorigin = /etc/mailname
mydomain = $DOMAIN
inet_interfaces = loopback-only
inet_protocols = ipv4
mydestination = \$myhostname, localhost.\$mydomain, localhost
mynetworks = 127.0.0.0/8 [::1]/128
relayhost =
smtp_tls_security_level = may
smtp_tls_CAfile = /etc/ssl/certs/ca-certificates.crt
EOF
fi

postfix check
systemctl enable postfix
systemctl restart postfix

echo ""
echo "Postfix läuft. Test (externe Adresse anpassen):"
echo "  echo 'Test extern' | mail -s 'Postfix extern' deine@gmail.com"
echo "  tail -f /var/log/mail.log"
echo ""
echo "App backend/.env:"
echo "  SMTP_HOST=127.0.0.1"
echo "  SMTP_PORT=25"
echo "  SMTP_FROM=noreply@$DOMAIN"
echo ""
echo "SPF-DNS und ggf. relayhost siehe deploy/POSTFIX-PASSWORT-RESET.md"
