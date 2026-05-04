# Deployment: Schritt-für-Schritt (Frontend unter `/paketdienst`)

Die App ist für einen **Unterpfad** konfiguriert (`vite.config.ts`: `base: '/paketdienst/'`). API und CORS müssen dazu passen.

---

## 1. Zielbild (kurz)

| Was | Beispiel |
|-----|----------|
| Öffentliche SPA | `https://wollatzsmarthome.ddns.net/paketdienst` |
| API (empfohlen, gleicher Host) | `https://wollatzsmarthome.ddns.net/paketdienst/api` |
| Backend **`FRONTEND_URL`** | dieselbe **öffentliche Basis** wie die SPA, **mit** Unterpfad, z. B. `https://wollatzsmarthome.ddns.net/paketdienst` |

---

## 2. Backend: `backend/.env` auf dem Server

Pflicht (sinngemäß anpassen):

1. **`FRONTEND_URL`** = exakt die Basis-URL, unter der Nutzer die App laden (HTTPS, Host, Unterpfad), z. B.  
   `FRONTEND_URL=https://wollatzsmarthome.ddns.net/paketdienst`  
   Erforderlich unter anderem für **E-Mail-Links** (Passwort-Reset). Beim Aufruf der API schickt der Browser den **Origin** nur als `https://wollatzsmarthome.ddns.net` (ohne `/paketdienst`); das Backend erlaubt CORS, wenn dieser Origin zu **`FRONTEND_URL`** passt (Vergleich der Origins).

2. **`PORT`**, **`DATABASE_URL`**, **`JWT_SECRET`**, ggf. Stripe/SMTP/Tracking wie gehabt setzen.

3. Backend neu bauen und starten:

   ```bash
   cd pfad/zum/backend
   npm ci
   npm run build
   ```

4. Den laufenden Dienst neu starten, z. B.:

   ```bash
   sudo systemctl restart DEIN_BACKEND_SERVICE
   # oder
   pm2 restart ALLE_ODER_APP_NAME
   ```

---

## 3. Frontend: `frontend/.env` **vor jedem Produktions-Build**

Variablen mit **`VITE_`** werden **beim Build** in den Code geschrieben. Ohne Neu-Build keine Wirkung.

1. **`VITE_FRONTEND_URL`** — öffentliche Eintrittsadresse der SPA (Schema + Host; mit oder ohne Unterpfad):
   - `https://wollatzsmarthome.ddns.net` **oder**
   - `https://wollatzsmarthome.ddns.net/paketdienst`  
   Wenn nur die Domain ohne Pfad: der Unterpfad kommt zusätzlich aus `vite`-`base` (`/paketdienst/`).

2. **`VITE_API_URL`** — **freiwillig:**
   - **Weglassen oder leer:** Axios nutzt unter derselben Domain **`{Unterpfad}/api`** → bei dir typisch **`https://…/paketdienst/api`** (korrekt nur, wenn Nginx das so weiterleitet).
   - **Setzen**, wenn die API unter einer **festen anderen** URL liegt, z. B. wenn sie nur unter **`https://host/api`** liegt:  
     `VITE_API_URL=https://wollatzsmarthome.ddns.net/api`

3. Frontend bauen und ausliefern:

   ```bash
   cd pfad/zum/frontend
   npm ci
   npm run build
   ```

4. **`dist/`** auf den Server kopieren (siehe Schritt 5).

---

## 4. Zielpfad für `dist/` herausfinden (Nginx)

Auf Ubuntu:

```bash
sudo nginx -T 2>/dev/null | grep -E 'root |alias |paketdienst'
```

Such den `location`-Block für `/paketdienst`. Entweder:

- **`alias /var/www/beispiel/;`** → dort muss **`index.html`** aus `dist/` liegen, Struktur exakt zur `alias`-Dokumentation,  
  oder
- **`root /var/www/html;`** unter `location /paketdienst/` → Dateien oft unter **`/var/www/html/paketdienst/`**.

Nach dem Kopieren oft **kein** `nginx reload` nötig, nur wenn sich die Konfig ändert.

---

## 5. Nginx/Oberfläche und API zusammenhalten (Orientierung)

- Statische SPA: Unter **`/paketdienst/`** aus `dist/` ausliefern, SPA-Fallback auf **`index.html`** für Client-Routes.
- API (**empfohlen**): Unter **`/paketdienst/api`** auf den Node-Prozess (Port z. B. 3001); Request-Pfad an Express kann **`/api/...`** bleiben, wenn ihr mit **`rewrite`** o. Ä. entsprechend weiterleitet (je nach bestehender Konfiguration).

Ein **Mismatch** zwischen `VITE_API_URL` / relativer Basis und dem, was Nginx routet, äußert sich durch **403** oder **404** auf einzelnen Pfaden — dann Nginx-Anker und `VITE_API_URL` angleichen.

---

## 6. Checkliste vor dem ersten Test im Browser

- [ ] `backend/.env`: `FRONTEND_URL` wie die echte Frontend-URL (mit `/paketdienst`).
- [ ] Backend nach Änderungen neu gebaut und Dienst neu gestartet.
- [ ] `frontend/.env`: `VITE_FRONTEND_URL` und ggf. `VITE_API_URL` für Produktion gesetzt.
- [ ] Frontend **`npm run build`**, dann aktuelles **`dist/`** an den Ordner aus Nginx kopiert.
- [ ] **Hard Reload** oder privates Fenster (alte gebaute JS-Dateien ohne `VITE_*` vermeiden).
- [ ] DevTools → Netzwerk: erste API-Anfragen gehen zur erwarteten Basis (`…/paketdienst/api/...` oder eure gesetzte `VITE_API_URL`).
- [ ] Bei Fehler **kein roter Eintrag mehr** mit JSON `CORS: Nicht erlaubter Origin` (sonst weiter `FRONTEND_URL`/Neustart prüfen).

---

## 7. Bei Problemen

| Symptom | Typische Ursache |
|--------|-------------------|
| API geht gegen `…/net/api/` ohne `/paketdienst` | Altes **`dist`** oder **`VITE_API_URL`** zeigt auf Root-`/api`. |
| CORS „Nicht erlaubter Origin“ | **`FRONTEND_URL`** falsch/leer oder Backend nicht neu gestartet; anderer Host (www vs. nicht-www). |
| URL verliert `/paketdienst` | Nginx-Redirect ohne Präfix oder alter Client ohne korrektes `basename`; siehe Frontend-Env und Neu-Build. |

Bei Zweifeln: erste **Dokument**-Antwort und die **XHR/fetch**-URL aus dem Netzwerk-Tab gegen diese Anleitung abgleichen.
