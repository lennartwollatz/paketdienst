# systemd für Paketdienst neu anlegen

Alles per **SSH** als User **`smarthome`**, App unter **`/var/www/paketdienst`**.

Die Vorlagen liegen im Git-Repo unter **`deploy/`** und werden nach **`/etc/systemd/system/`** kopiert.

| Unit | Startet | Lokal |
|------|---------|--------|
| `paketdienst-api.service` | Backend `node dist/index.js` | `127.0.0.1:3001` → `/api/…` |
| `paketdienst-web.service` | `node deploy/static-server.js` | `127.0.0.1:3002` → `/paketdienst/` |
| `paketdienst.target` | gruppiert API + Web | — |

Nginx leitet von außen auf diese Ports weiter (siehe `deploy/nginx-paketdienst.conf`).

---

## Variablen

Zentral: **`deploy/server.defaults.sh`**

```bash
source /var/www/paketdienst/deploy/server.defaults.sh
# APP=/var/www/paketdienst  USER=smarthome
```

---

## Weg A: Skript (empfohlen)

Voraussetzung: aktueller Code mit `deploy/*.service` ( **`git pull`** ).

```bash
cd /var/www/paketdienst
git pull
chmod +x deploy/install-systemd.sh
DEPLOY_SUDO=1 ./deploy/install-systemd.sh
```

Das Skript: stoppt PM2/alte Units → kopiert drei Dateien → setzt Pfade/User → `daemon-reload` → `enable` → `start paketdienst.target`.

---

## Weg B: Manuell (Copy & Paste)

In **dieser Reihenfolge** ausführen.

### 1. Code aktualisieren

```bash
cd /var/www/paketdienst
git pull
```

Wenn `deploy/paketdienst-api.service` fehlt: erst vom PC **pushen**, dann erneut `git pull`.

### 2. Alte Prozesse abschalten

```bash
pm2 delete paketdienst 2>/dev/null || true
pm2 delete paketdienst-backend 2>/dev/null || true
sudo systemctl stop paketdienst-api paketdienst-web 2>/dev/null || true
sudo systemctl disable paketdienst-api paketdienst-web 2>/dev/null || true
```

Falls du früher **andere Namen** hattest (z. B. nur `paketdienst-backend`):

```bash
sudo systemctl disable --now paketdienst-backend 2>/dev/null || true
sudo rm -f /etc/systemd/system/paketdienst-backend.service
sudo systemctl daemon-reload
```

### 3. Service-Dateien installieren und Pfade setzen

```bash
cd /var/www/paketdienst
source deploy/server.defaults.sh

sudo cp "$APP/deploy/paketdienst-api.service" /etc/systemd/system/
sudo cp "$APP/deploy/paketdienst-web.service" /etc/systemd/system/
sudo cp "$APP/deploy/paketdienst.target" /etc/systemd/system/

sudo sed -i "s|^WorkingDirectory=.*|WorkingDirectory=${APP}/backend|" /etc/systemd/system/paketdienst-api.service
sudo sed -i "s|^WorkingDirectory=.*|WorkingDirectory=${APP}|" /etc/systemd/system/paketdienst-web.service
sudo sed -i "s|^Environment=FRONTEND_DIST=.*|Environment=FRONTEND_DIST=${APP}/frontend/dist|" /etc/systemd/system/paketdienst-web.service
sudo sed -i "s|^EnvironmentFile=.*|EnvironmentFile=-${APP}/backend/.env|" /etc/systemd/system/paketdienst-api.service
sudo sed -i "s|^User=.*|User=${USER}|" /etc/systemd/system/paketdienst-api.service
sudo sed -i "s|^Group=.*|Group=${USER}|" /etc/systemd/system/paketdienst-api.service
sudo sed -i "s|^User=.*|User=${USER}|" /etc/systemd/system/paketdienst-web.service
sudo sed -i "s|^Group=.*|Group=${USER}|" /etc/systemd/system/paketdienst-web.service
```

**Node-Pfad prüfen** (wichtig auf dem Pi):

```bash
which node
```

Wenn z. B. `/usr/bin/node` (nicht über `env`):

```bash
sudo sed -i 's|^ExecStart=.*|ExecStart=/usr/bin/node dist/index.js|' /etc/systemd/system/paketdienst-api.service
sudo sed -i 's|^ExecStart=.*|ExecStart=/usr/bin/node deploy/static-server.js|' /etc/systemd/system/paketdienst-web.service
```

(Pfad durch Ausgabe von `which node` ersetzen.)

### 4. Vor dem Start: Build + `.env`

Ohne Build und Env starten die Dienste nicht sauber:

```bash
cd /var/www/paketdienst
npm run env:init    # nur wenn .env noch fehlt
nano backend/.env frontend/.env
DEPLOY_SUDO=1 npm run build
```

(`npm run build` baut und startet die Units neu — du kannst Schritt 5 überspringen, wenn der Build durchlief.)

### 5. systemd aktivieren und starten

Nur nötig, wenn du **ohne** `npm run build` nur die Units neu angelegt hast:

```bash
sudo systemctl daemon-reload
sudo systemctl enable paketdienst-api paketdienst-web paketdienst.target
sudo systemctl start paketdienst.target
sudo systemctl status paketdienst.target paketdienst-api paketdienst-web
```

Beide Services: **`active (running)`**.

### 6. Kurztest

```bash
curl -s http://127.0.0.1:3001/api/health
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3002/paketdienst/
```

Erwartung: JSON mit `"status":"ok"` und **200**.

---

## Target im Alltag

| Aktion | Befehl |
|--------|--------|
| Alles starten | `sudo systemctl start paketdienst.target` |
| Alles stoppen | `sudo systemctl stop paketdienst-api paketdienst-web` |
| Neu starten (zuverlässig) | `sudo systemctl restart paketdienst-api paketdienst-web` |
| Logs API | `sudo journalctl -u paketdienst-api -n 50 --no-pager` |
| Logs Web | `sudo journalctl -u paketdienst-web -n 50 --no-pager` |
| Live-Logs | `sudo journalctl -u paketdienst-api -f` |

---

## So müssen die Dateien aussehen (Referenz)

`/etc/systemd/system/paketdienst-api.service`:

```ini
[Unit]
Description=Paketdienst Backend (Node.js API)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=smarthome
Group=smarthome
WorkingDirectory=/var/www/paketdienst/backend
EnvironmentFile=-/var/www/paketdienst/backend/.env
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=HOST=127.0.0.1
ExecStart=/usr/bin/env node dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/paketdienst-web.service`:

```ini
[Unit]
Description=Paketdienst Frontend (statische Web-App)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=smarthome
Group=smarthome
WorkingDirectory=/var/www/paketdienst
Environment=NODE_ENV=production
Environment=BASE_PATH=/paketdienst
Environment=FRONTEND_DIST=/var/www/paketdienst/frontend/dist
Environment=PORT=3002
Environment=HOST=127.0.0.1
ExecStart=/usr/bin/env node deploy/static-server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/paketdienst.target`:

```ini
[Unit]
Description=Paketdienst (Frontend + API)
Wants=paketdienst-api.service paketdienst-web.service
After=network-online.target

[Install]
WantedBy=multi-user.target
```

---

## Wenn Schritt 5 oder 6 fehlschlägt

```bash
systemctl list-units 'paketdienst*'
grep -E 'WorkingDirectory|ExecStart|User=' /etc/systemd/system/paketdienst-*.service
ls -la /var/www/paketdienst/backend/dist/index.js
ls -la /var/www/paketdienst/frontend/dist/index.html
sudo journalctl -u paketdienst-api -n 30 --no-pager
sudo journalctl -u paketdienst-web -n 30 --no-pager
```

Typische Ursachen: **`frontend/dist` fehlt** (Build), **`backend/.env` fehlt**, falscher **`WorkingDirectory`**, **`node` nicht gefunden**.

---

## Updates danach

Units neu kopieren macht **`npm run build`** automatisch mit. Im Alltag reicht:

```bash
cd /var/www/paketdienst
DEPLOY_SUDO=1 npm run build
```

Weitere Infos: **`deploy/INSTALL-SERVER.md`**.
