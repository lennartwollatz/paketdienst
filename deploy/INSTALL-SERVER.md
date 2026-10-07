# Paketdienst auf dem Server (systemd + `npm run build`)

Alles auf dem Raspberry/Server per **SSH** als User **`smarthome`**, App unter **`/var/www/paketdienst`**, öffentlicher Pfad **`/paketdienst`**.

| Komponente | Lokal (127.0.0.1) | Von außen (Nginx) |
|------------|-------------------|-------------------|
| API | `:3001` → `/api/…` | `https://wollatzsmarthome.ddns.net/paketdienst/api/…` |
| Frontend | `:3002` → `/paketdienst/` | `https://wollatzsmarthome.ddns.net/paketdienst/` |

Steuerung über **`deploy/production.json`** (Pfade, Ports, Unit-Namen).

---

## Ein Weg: systemd neu einrichten

### 0. Variablen (nur zur Orientierung — im Repo bereits gesetzt)

```bash
APP=/var/www/paketdienst
USER=smarthome
```

### 1. Einmalig: Env-Dateien

**Backend** `/var/www/paketdienst/backend/.env` (mindestens):

```env
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://wollatzsmarthome.ddns.net/paketdienst
DATABASE_URL="file:./prod.db"
JWT_SECRET=…
```

**Frontend** `/var/www/paketdienst/frontend/.env` (vor jedem Build prüfen):

```env
VITE_FRONTEND_URL=https://wollatzsmarthome.ddns.net/paketdienst
# VITE_API_URL leer lassen → relative /paketdienst/api
VITE_STRIPE_PUBLISHABLE_KEY=pk_…
```

### 2. Code holen (erstes Mal)

```bash
cd /var/www/paketdienst
git pull
```

Wenn das Repo noch nicht liegt: klonen nach `/var/www/paketdienst`, dann `.env`-Dateien wie oben.

### 3. Altes Backend (PM2) abschalten

```bash
pm2 delete paketdienst 2>/dev/null || true
pm2 delete paketdienst-backend 2>/dev/null || true
sudo systemctl stop paketdienst-api paketdienst-web 2>/dev/null || true
```

### 4. Service-Dateien installieren

Die Vorlagen liegen im Repo unter `deploy/`:

| Datei im Repo | Auf dem Server |
|---------------|----------------|
| `deploy/paketdienst-api.service` | `/etc/systemd/system/paketdienst-api.service` |
| `deploy/paketdienst-web.service` | `/etc/systemd/system/paketdienst-web.service` |
| `deploy/paketdienst.target` | `/etc/systemd/system/paketdienst.target` |

Einmalig (oder ab jetzt automatisch über `npm run build`):

```bash
cd /var/www/paketdienst
sudo cp deploy/paketdienst-api.service /etc/systemd/system/
sudo cp deploy/paketdienst-web.service /etc/systemd/system/
sudo cp deploy/paketdienst.target /etc/systemd/system/
sudo sed -i "s|WorkingDirectory=.*|WorkingDirectory=/var/www/paketdienst/backend|" /etc/systemd/system/paketdienst-api.service
sudo sed -i "s|WorkingDirectory=.*|WorkingDirectory=/var/www/paketdienst|" /etc/systemd/system/paketdienst-web.service
sudo sed -i "s|Environment=FRONTEND_DIST=.*|Environment=FRONTEND_DIST=/var/www/paketdienst/frontend/dist|" /etc/systemd/system/paketdienst-web.service
sudo sed -i "s|^User=.*|User=smarthome|" /etc/systemd/system/paketdienst-api.service
sudo sed -i "s|^Group=.*|Group=smarthome|" /etc/systemd/system/paketdienst-api.service
sudo sed -i "s|^User=.*|User=smarthome|" /etc/systemd/system/paketdienst-web.service
sudo sed -i "s|^Group=.*|Group=smarthome|" /etc/systemd/system/paketdienst-web.service
```

**Inhalt der Units (Referenz):**

`/etc/systemd/system/paketdienst-api.service` — Backend, Port **3001**:

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
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=HOST=127.0.0.1
EnvironmentFile=-/var/www/paketdienst/backend/.env
ExecStart=/usr/bin/env node dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/paketdienst-web.service` — statisches Frontend, Port **3002**:

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

`/etc/systemd/system/paketdienst.target` — beide Dienste gruppieren:

```ini
[Unit]
Description=Paketdienst (Frontend + API)
Wants=paketdienst-api.service paketdienst-web.service
After=network-online.target

[Install]
WantedBy=multi-user.target
```

Falls `node` nicht gefunden wird: `which node` und in beiden `.service`-Dateien z. B. `ExecStart=/usr/bin/node …` setzen.

### 5. systemd aktivieren und starten

```bash
sudo systemctl daemon-reload
sudo systemctl enable paketdienst-api paketdienst-web paketdienst.target
sudo systemctl start paketdienst.target
sudo systemctl status paketdienst.target paketdienst-api paketdienst-web
```

Beide Services sollten **active (running)** sein.

**Im Alltag mit Target:**

| Aktion | Befehl |
|--------|--------|
| Alles starten | `sudo systemctl start paketdienst.target` |
| Alles stoppen | `sudo systemctl stop paketdienst-api paketdienst-web` |
| Neu starten | `sudo systemctl restart paketdienst-api paketdienst-web` |
| Logs | `sudo journalctl -u paketdienst-api -f` / `-u paketdienst-web -f` |

### 6. Kurztest (lokal auf dem Server)

```bash
curl -s http://127.0.0.1:3001/api/health
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3002/paketdienst/
```

Erwartung: JSON mit `"status":"ok"` und HTTP **200**.

Von außen (wenn Nginx passt):

```bash
curl -s https://wollatzsmarthome.ddns.net/paketdienst/api/health
```

### 7. Nginx (einmalig)

Snippet aus **`deploy/nginx-paketdienst.conf`** in die `server`-Konfiguration einbauen:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

App-URL: **https://wollatzsmarthome.ddns.net/paketdienst/**

---

## Später nach jedem Update (Standard)

Vom Repo-Root — **ein Befehl**:

```bash
cd /var/www/paketdienst
DEPLOY_SUDO=1 npm run build
```

Das Skript **`scripts/server-build.mjs`** erledigt automatisch:

1. `git pull --ff-only`
2. `npm ci` in Backend und Frontend
3. SQLite-Backup (falls DB existiert)
4. `prisma generate` + `migrate deploy`
5. Build Backend + Frontend
6. alte PM2-Prozesse entfernen (falls vorhanden)
7. systemd-Units aus `deploy/` nach `/etc/systemd/system/` kopieren
8. `daemon-reload`, `enable`, **restart** API + Web
9. Health-Check auf Port 3001 und 3002

Bei Bedarf sudo-Passwort eingeben.

**Optional dauerhaft** in `~/.bashrc`:

```bash
export DEPLOY_SUDO=1
```

Dann reicht:

```bash
cd /var/www/paketdienst
npm run build
```

**Ohne Git / ohne systemd** (nur lokal bauen):

```bash
SKIP_GIT_PULL=1 SKIP_SYSTEMD=1 npm run build:compile
```

---

## Ersteinrichtung in einem Block (Copy & Paste)

Nachdem `backend/.env` und `frontend/.env` existieren und der Code unter `/var/www/paketdienst` liegt:

```bash
cd /var/www/paketdienst
git pull
pm2 delete paketdienst 2>/dev/null || true
pm2 delete paketdienst-backend 2>/dev/null || true
sudo systemctl stop paketdienst-api paketdienst-web 2>/dev/null || true
DEPLOY_SUDO=1 npm run build
sudo systemctl status paketdienst-api paketdienst-web
curl -s http://127.0.0.1:3001/api/health
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3002/paketdienst/
```

---

## Wenn etwas fehlschlägt

```bash
systemctl list-units 'paketdienst*'
grep WorkingDirectory /etc/systemd/system/paketdienst-*.service
sudo journalctl -u paketdienst-api -n 30 --no-pager
sudo journalctl -u paketdienst-web -n 30 --no-pager
```

Typisch: falscher Pfad, fehlendes `frontend/dist` (Build fehlgeschlagen), fehlende `.env`, oder `node` nicht im PATH.

Weitere Details: **`DEPLOYMENT.md`** (CORS, VITE_*, Push, Nginx-Fallstricke).
