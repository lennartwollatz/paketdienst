# Paketdienst auf dem Server (systemd + `npm run build`)

Alles auf dem Raspberry/Server per **SSH** als User **`smarthome`**, App unter **`/var/www/paketdienst`**, öffentlicher Pfad **`/paketdienst`**.

| Komponente | Lokal (127.0.0.1) | Von außen (Nginx) |
|------------|-------------------|-------------------|
| API | `:3001` → `/api/…` | `https://wollatzsmarthome.ddns.net/paketdienst/api/…` |
| Frontend | `:3002` → `/paketdienst/` | `https://wollatzsmarthome.ddns.net/paketdienst/` |

Steuerung über **`deploy/production.json`** (Pfade, Ports, Unit-Namen).

---

## Ein Weg: systemd neu einrichten

### 0. Variablen (zentral im Repo)

Datei **`deploy/server.defaults.sh`** (überall gleich):

```bash
APP=/var/www/paketdienst
USER=smarthome
```

In Anleitungen und Skripten: `source deploy/server.defaults.sh`, dann `$APP` und `$USER` verwenden.

### 1. Einmalig: Env-Dateien kopieren

Vorlagen liegen im Repo unter `deploy/` (ohne echte Secrets, dürfen ins Git).

```bash
cd /var/www/paketdienst
git pull
npm run env:init
```

Das legt **nur an**, wenn die Datei noch fehlt:

- `backend/.env` ← `deploy/env.backend.production.example`
- `frontend/.env` ← `deploy/env.frontend.production.example`

**Manuell (gleiche Wirkung):**

```bash
cd /var/www/paketdienst
test -f backend/.env  || cp deploy/env.backend.production.example backend/.env
test -f frontend/.env || cp deploy/env.frontend.production.example frontend/.env
```

**Danach einmal bearbeiten** (Secrets eintragen):

```bash
nano backend/.env
nano frontend/.env
```

Mindestens **`JWT_SECRET`**, **`VITE_STRIPE_PUBLISHABLE_KEY`** / Stripe im Backend; Rest nach Bedarf (OpenAI, SMTP, TrackingMore, VAPID).

**Datenbank:** Beim ersten Deploy legt `npm run build` die Tabellen per **`prisma migrate deploy`** an (`backend/prisma/migrations/`).  
Fehler **`P2021` / table Order does not exist** → Migrationen fehlen oder `.env` zeigt auf leere DB:

```bash
cd /var/www/paketdienst
grep DATABASE_URL backend/.env
npm run db:deploy --prefix backend
sudo systemctl restart paketdienst-api
```

Alternative für lokale Entwicklung statt Produktion:

```bash
test -f backend/.env  || cp backend/.env.example backend/.env
test -f frontend/.env || cp frontend/.env.example frontend/.env
```

`.env`-Dateien werden **nicht** überschrieben, wenn sie schon existieren — Updates per `npm run build` bleiben unberührt.

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

**Ausführliche Anleitung nur für systemd:** **`deploy/SYSTEMD-NEU-EINRICHTEN.md`**  
**Skript:** `DEPLOY_SUDO=1 ./deploy/install-systemd.sh`

Die Vorlagen liegen im Repo unter `deploy/`:

| Datei im Repo | Auf dem Server |
|---------------|----------------|
| `deploy/paketdienst-api.service` | `/etc/systemd/system/paketdienst-api.service` |
| `deploy/paketdienst-web.service` | `/etc/systemd/system/paketdienst-web.service` |
| `deploy/paketdienst.target` | `/etc/systemd/system/paketdienst.target` |

Einmalig (oder ab jetzt automatisch über `npm run build`):

```bash
cd /var/www/paketdienst
source deploy/server.defaults.sh

sudo cp deploy/paketdienst-api.service /etc/systemd/system/
sudo cp deploy/paketdienst-web.service /etc/systemd/system/
sudo cp deploy/paketdienst.target /etc/systemd/system/
sudo sed -i "s|WorkingDirectory=.*|WorkingDirectory=$APP/backend|" /etc/systemd/system/paketdienst-api.service
sudo sed -i "s|WorkingDirectory=.*|WorkingDirectory=$APP|" /etc/systemd/system/paketdienst-web.service
sudo sed -i "s|Environment=FRONTEND_DIST=.*|Environment=FRONTEND_DIST=$APP/frontend/dist|" /etc/systemd/system/paketdienst-web.service
sudo sed -i "s|^EnvironmentFile=.*|EnvironmentFile=-$APP/backend/.env|" /etc/systemd/system/paketdienst-api.service
sudo sed -i "s|^User=.*|User=$USER|" /etc/systemd/system/paketdienst-api.service
sudo sed -i "s|^Group=.*|Group=$USER|" /etc/systemd/system/paketdienst-api.service
sudo sed -i "s|^User=.*|User=$USER|" /etc/systemd/system/paketdienst-web.service
sudo sed -i "s|^Group=.*|Group=$USER|" /etc/systemd/system/paketdienst-web.service
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

Beim Kopieren nach `/etc/systemd/system/` wird auf Linux automatisch **`sudo`** verwendet (Passwort kann abgefragt werden).

Ohne systemd-Rechte nur bauen:

```bash
SKIP_SYSTEMD=1 npm run build
```

Explizit kein sudo (schlägt bei systemd fehl): `DEPLOY_SUDO=0 npm run build`

**Ohne Git / ohne systemd** (nur lokal bauen):

```bash
SKIP_GIT_PULL=1 SKIP_SYSTEMD=1 npm run build:compile
```

**Wichtig:** Deploy immer vom **Repo-Root** `/var/www/paketdienst` starten — nicht aus `backend/`.
Dort würde nur `tsc` laufen, **ohne** `npm ci` und ohne systemd-Skript.
Nach `git pull` fehlen dann neue Pakete (z. B. `@aftership/tracking-sdk`) → Build-Fehler TS2307.

---

## Ersteinrichtung in einem Block (Copy & Paste)

Nachdem der Code unter `/var/www/paketdienst` liegt:

```bash
cd /var/www/paketdienst
git pull
npm run env:init
nano backend/.env frontend/.env
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
