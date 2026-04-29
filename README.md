# Paketdienst WebApp

Eine mobile Full-Stack-Webapp zur automatischen Erkennung von Bestellungen aus E-Mails und Verfolgung von Paketen.

## Features

- Registrierung und Login mit E-Mail & Passwort
- Passwort zurücksetzen und ändern
- Kreditkarte hinterlegen via Stripe
- E-Mail-Konten verbinden (Gmail, Outlook, GMX, Web.de, Yahoo, iCloud, u.a.) per IMAP
- Automatische Erkennung von Bestellungen aus E-Mails (via OpenAI GPT-4o-mini)
- Direkte Paketverfolgung über Carrier-Provider (DHL, UPS, Hermes, DPD, GLS)
- 20 verarbeitete Bestellungen gratis, danach einmalige Freischaltung (10 EUR) via Stripe
- Modernes, mobiles Design mit Bottom-Navigation

## Testzugang

| Feld     | Wert           |
|----------|----------------|
| E-Mail   | lena@test.local |
| Passwort | lennart        |

Der Testzugang umgeht die Stripe-Zahlungspflicht.

## Technischer Stack

- **Backend:** Node.js + Express + TypeScript + Prisma (SQLite)
- **Frontend:** React + Vite + TypeScript + Tailwind CSS
- **Auth:** JWT + bcrypt
- **Zahlung:** Stripe
- **E-Mail:** imapflow (IMAP)
- **KI:** OpenAI GPT-4o-mini
- **Tracking:** Direkte Carrier-Provider + Orchestrator

## Projekt starten

### Voraussetzungen

- Node.js 18+
- npm

### 1. Backend einrichten

```bash
cd backend
npm install
```

Konfigurationsdatei erstellen:
```bash
cp .env.example .env
```

`.env` anpassen – wichtige Einträge:
```env
JWT_SECRET=dein-geheimer-schlüssel

# Stripe (https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# OpenAI (https://platform.openai.com/api-keys)
OPENAI_API_KEY=sk-...

# Tracking Orchestrierung
TRACKING_ENABLE_LEGACY_FALLBACK=false
TRACKING_PROVIDER_TIMEOUT_MS=12000
TRACKING_POLLING_ENABLED=false
TRACKING_POLLING_INTERVAL_MS=1800000

# DHL
DHL_API_KEY=...

# UPS
UPS_CLIENT_ID=...
UPS_CLIENT_SECRET=...

# Hermes
HERMES_API_KEY=...

# DPD
DPD_CLIENT_ID=...
DPD_CLIENT_SECRET=...

# GLS
GLS_API_KEY=...

# Passwort-Reset E-Mail (optional, z.B. Gmail App-Passwort)
SMTP_USER=deine@email.de
SMTP_PASS=dein-app-passwort
```

Datenbank initialisieren und Testuser anlegen:
```bash
npm run db:migrate
npm run db:seed
```

Backend starten:
```bash
npm run dev
```

Backend läuft auf http://localhost:3001

### 2. Frontend einrichten

```bash
cd frontend
npm install
```

Stripe Public Key eintragen in `frontend/.env`:
```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

Frontend starten:
```bash
npm run dev
```

Frontend läuft auf http://localhost:5173

## API-Keys konfigurieren

### Stripe (Kreditkarte)

1. Konto erstellen auf [stripe.com](https://stripe.com)
2. Im Dashboard unter "Entwickler" → "API-Schlüssel" die Test-Keys kopieren
3. `STRIPE_SECRET_KEY` und `STRIPE_PUBLISHABLE_KEY` in die `.env`-Dateien eintragen
4. Optional Preisparameter in `backend/.env` steuern:
   - `ONE_TIME_PAYMENT_AMOUNT_CENTS=1000` (10 EUR)
   - `FREE_PROCESSED_ORDERS_LIMIT=20`

### OpenAI (Bestellungserkennung)

1. Konto erstellen auf [platform.openai.com](https://platform.openai.com)
2. API-Key erstellen unter "API Keys"
3. `OPENAI_API_KEY` in `backend/.env` eintragen
4. Ohne OpenAI funktioniert ein regelbasierter Fallback für gängige Bestellmails

### Carrier-APIs (Paketverfolgung)

Die App nutzt direkte Provider-Integrationen statt 17TRACK. Für jeden Carrier werden eigene Zugangsdaten in `backend/.env` gesetzt:

1. DHL: `DHL_API_KEY`
2. UPS: `UPS_CLIENT_ID`, `UPS_CLIENT_SECRET`
3. Hermes: `HERMES_API_KEY`
4. DPD: `DPD_CLIENT_ID`, `DPD_CLIENT_SECRET`
5. GLS: `GLS_API_KEY`

Bezugsquellen für API-Zugänge:

- **DHL:** Registrierung im DHL Developer Portal ([developer.dhl.com](https://developer.dhl.com)). Dort App anlegen und API-Key erzeugen (`DHL_API_KEY`).
- **UPS:** Registrierung im UPS Developer Portal ([developer.ups.com](https://developer.ups.com)). App erstellen und OAuth-Zugangsdaten beziehen (`UPS_CLIENT_ID`, `UPS_CLIENT_SECRET`).
- **Hermes:** API-Zugang meist nur für Geschäftskunden/Partner. Zugang typischerweise über Hermes Business-Vertrieb bzw. technischen Integrations-Support anfragen; danach API-Key/Token als `HERMES_API_KEY` hinterlegen.
- **DPD:** Zugang in der Regel über DPD Business-/Entwicklerzugang für Geschäftskunden. Nach Freischaltung Client-Credentials als `DPD_CLIENT_ID` und `DPD_CLIENT_SECRET` hinterlegen.
- **GLS:** API-Zugang über GLS Business-IT-Integration anfragen ([gls-group.com](https://gls-group.com)); nach Freischaltung den bereitgestellten Key als `GLS_API_KEY` eintragen.

Hinweis: Bei einigen Carriern werden APIs erst nach Vertrag, technischem Onboarding oder Produktfreischaltung aktiviert.

## Abrechnungslogik

- Bei der Registrierung ist keine Kreditkarte erforderlich.
- Die ersten `FREE_PROCESSED_ORDERS_LIMIT` verarbeiteten Bestellungen sind kostenlos.
- Verarbeitet bedeutet: Status `Zugestellt`/`Delivered` oder `Zurückgesendet`/`Returned`.
- Erst ab Erreichen dieses Limits wird eine einmalige Stripe-Zahlung fällig (`ONE_TIME_PAYMENT_AMOUNT_CENTS`, Standard 10 EUR).
- Nach erfolgreicher Zahlung ist die Tracking-Nutzung dauerhaft freigeschaltet (kein Abo).

Optionale Betriebs-Flags:

- `TRACKING_ENABLE_LEGACY_FALLBACK=true` aktiviert Mock-Fallback bei Provider-Fehlern
- `TRACKING_POLLING_ENABLED=true` aktiviert periodische Aktualisierung offener Sendungen
- `TRACKING_POLLING_INTERVAL_MS` steuert das Polling-Intervall (Standard: 30 Minuten)

### Gmail IMAP einrichten

1. Gmail öffnen → Einstellungen → Weiterleitung und POP/IMAP → IMAP aktivieren
2. Google-Konto → Sicherheit → 2-Faktor-Authentifizierung aktivieren
3. App-Passwörter → App: E-Mail, Gerät: Sonstiges → Generieren
4. In der App: Provider "Gmail" auswählen, E-Mail und App-Passwort eingeben

### Outlook IMAP einrichten

1. Normales Microsoft-Passwort verwenden
2. Falls 2FA aktiv: account.microsoft.com → Sicherheit → App-Passwörter erstellen

## Projektstruktur

```
paketdienst/
├── backend/
│   ├── src/
│   │   ├── routes/         # API-Endpunkte
│   │   ├── services/       # IMAP, OpenAI, Tracking-Provider, Stripe, Mailer
│   │   ├── middleware/      # Auth-Guard, Payment-Check
│   │   └── seed.ts         # Testuser anlegen
│   ├── prisma/
│   │   └── schema.prisma   # Datenbankschema
│   └── .env                # Konfiguration
└── frontend/
    └── src/
        ├── pages/          # Login, Register, Home, OrderDetail, etc.
        ├── components/     # Wiederverwendbare UI-Komponenten
        ├── api/            # API-Client (axios)
        └── store/          # Zustand-Verwaltung (zustand)
```

## Hinweise

- Passwörter werden in der Datenbank als bcrypt-Hash gespeichert
- IMAP-Passwörter werden XOR-verschlüsselt gespeichert (für Produktion: AES empfohlen)
- Ohne korrekt konfigurierte Carrier-Keys schlagen echte Tracking-Abfragen fehl
- Optional kann ein Mock-Fallback über `TRACKING_ENABLE_LEGACY_FALLBACK=true` aktiviert werden
- Der Stripe-Onboarding-Schritt kann in der Entwicklung übersprungen werden
