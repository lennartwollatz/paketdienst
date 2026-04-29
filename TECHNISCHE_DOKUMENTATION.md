# Technische Dokumentation – Paketdienst WebApp

Diese Dokumentation erklärt den Aufbau, die Prozesse und die Codestruktur der Paketdienst-App im Detail. Sie richtet sich an Entwickler, die den Code verstehen, erweitern oder warten möchten.

---

## Inhaltsverzeichnis

1. [Gesamtarchitektur](#1-gesamtarchitektur)
2. [Backend – Aufbau und Einstiegspunkt](#2-backend--aufbau-und-einstiegspunkt)
3. [Datenbank und Schema](#3-datenbank-und-schema)
4. [Authentifizierung und Autorisierung](#4-authentifizierung-und-autorisierung)
5. [Zahlungssystem (Stripe)](#5-zahlungssystem-stripe)
6. [E-Mail-Integration (IMAP)](#6-e-mail-integration-imap)
7. [Bestellungserkennung (OpenAI Batch API)](#7-bestellungserkennung-openai-batch-api)
8. [Paketverfolgung (Carrier-Providers)](#8-paketverfolgung-carrier-providers)
9. [Automatische Hintergrundprozesse](#9-automatische-hintergrundprozesse)
10. [Ordner-Verwaltung pro E-Mail-Konto](#10-ordner-verwaltung-pro-e-mail-konto)
11. [XSS-Schutz und Sicherheitsmaßnahmen](#11-xss-schutz-und-sicherheitsmaßnahmen)
12. [Frontend – Aufbau und Routing](#12-frontend--aufbau-und-routing)
13. [State Management (Zustand)](#13-state-management-zustand)
14. [API-Client (Axios)](#14-api-client-axios)
15. [Vollständige Prozessketten](#15-vollständige-prozessketten)
16. [Umgebungsvariablen-Referenz](#16-umgebungsvariablen-referenz)

---

## 1. Gesamtarchitektur

Die App ist in zwei vollständig getrennte Prozesse aufgeteilt, die miteinander über eine REST-API kommunizieren:

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser / Mobilgerät                     │
│                                                             │
│   React SPA (Vite, Port 5173)                               │
│   ├── Routing: react-router-dom                             │
│   ├── State: Zustand (authStore)                            │
│   ├── HTML-Sanitierung: DOMPurify                           │
│   └── HTTP: Axios → /api/* (Proxy → Port 3001)              │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP REST (JSON)
┌─────────────────────▼───────────────────────────────────────┐
│                Express-Server (Port 3001)                    │
│                                                             │
│   Middleware: Security-Header, CORS, JSON-Parser,           │
│               JWT-Auth, Payment-Check                       │
│   Routes: /api/auth  /api/stripe  /api/email-accounts       │
│           /api/orders  /api/attachments  /api/health        │
│                                                             │
│   Services:                                                 │
│   ├── mailer.ts        (Nodemailer / SMTP)                  │
│   ├── imap.ts          (imapflow – alle Ordner)             │
│   ├── openai.ts        (GPT-4o-mini + Batch API)            │
│   ├── emailPoller.ts   (stündlicher Hintergrund-Sync)       │
│   └── tracking/        (DHL, UPS, Hermes, DPD, GLS)        │
│       └── poller.ts    (Hintergrund-Timer)                  │
│                                                             │
│   Datenbank: SQLite via Prisma ORM (dev.db)                 │
└─────────────────────────────────────────────────────────────┘
                      │
         ┌────────────┼────────────┐
         ▼            ▼            ▼
    Stripe API    OpenAI API   Carrier APIs
                               (DHL, UPS…)
```

Der Vite-Dev-Server leitet alle Anfragen an `/api/*` automatisch an Port 3001 weiter (konfiguriert in `frontend/vite.config.ts`). Im Produktionsbetrieb würde ein Reverse Proxy (z. B. nginx) diese Aufgabe übernehmen.

---

## 2. Backend – Aufbau und Einstiegspunkt

**Datei:** `backend/src/index.ts`

```
Express-App startet
  ├── Security-Header setzen (alle Antworten):
  │     X-Content-Type-Options: nosniff
  │     X-Frame-Options: DENY
  │     X-XSS-Protection: 1; mode=block
  │     Referrer-Policy: strict-origin-when-cross-origin
  │     Content-Security-Policy: default-src 'none'; frame-ancestors 'none'
  ├── CORS konfigurieren (nur localhost:* und FRONTEND_URL erlaubt)
  ├── Stripe-Webhook-Route bekommt raw-Body (kein JSON-Parse)
  ├── Alle anderen Routen bekommen JSON-Parse-Middleware
  ├── Routen mounten:
  │     /api/auth            → routes/auth.ts
  │     /api/stripe          → routes/stripe.ts
  │     /api/email-accounts  → routes/emailAccounts.ts
  │     /api/orders          → routes/orders.ts
  │     /api/attachments     → routes/attachments.ts
  │     /api/health          → Inline-Handler
  ├── Globaler Fehler-Handler (500er für unerwartete Fehler)
  └── Server startet:
        ├── startTrackingPoller() – Tracking-Hintergrundprozess
        └── startEmailPoller()   – E-Mail-Hintergrundprozess (stündlich)
```

---

## 3. Datenbank und Schema

**Datei:** `backend/prisma/schema.prisma`

Die Datenbank ist eine SQLite-Datei (`dev.db`) und wird durch Prisma ORM verwaltet.

### User

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | String (CUID) | Primärschlüssel, automatisch generiert |
| `email` | String (unique) | Login-E-Mail |
| `passwordHash` | String | bcrypt-Hash mit Kostenfaktor 12 |
| `isTestUser` | Boolean | Wenn `true`: Stripe-Bypass aktiv |
| `stripeCustomerId` | String? | Stripe-Kunden-ID für API-Aufrufe |
| `stripeSubscriptionId` | String? | Reserviert für zukünftige Abos |
| `hasPaymentMethod` | Boolean | `true` nach erfolgreicher Zahlung |
| `resetToken` | String? | UUID für Passwort-Reset (temporär) |
| `resetTokenExpiry` | DateTime? | Ablaufzeit des Reset-Tokens (1 Stunde) |

### EmailAccount

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | String (CUID) | Primärschlüssel |
| `userId` | String | Fremdschlüssel → User |
| `provider` | String | z. B. `gmail`, `outlook`, `gmx` |
| `email` | String | Angezeigte E-Mail-Adresse |
| `imapHost` | String | IMAP-Server (z. B. `imap.gmail.com`) |
| `imapPort` | Int | Standard: 993 (SSL) |
| `username` | String | IMAP-Login-Name (meist E-Mail) |
| `passwordEncrypted` | String | XOR-verschlüsselt + Base64-kodiert |
| `lastSyncAt` | DateTime? | Zeitstempel der letzten Synchronisierung |
| `blockedFolders` | String | JSON-Array mit gesperrten Ordnerpfaden (Standard: `"[]"`) |

Das Feld `blockedFolders` speichert ein JSON-Array von IMAP-Ordnerpfaden, die beim Sync **niemals** ausgelesen werden. Die Serialisierung als String (nicht als natives JSON-Feld) ist SQLite-kompatibel.

### Order

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | String (CUID) | Primärschlüssel |
| `userId` | String | Fremdschlüssel → User |
| `emailAccountId` | String? | Fremdschlüssel → EmailAccount |
| `shop` | String | Shop-Name (von OpenAI erkannt) |
| `orderNumber` | String? | Bestellnummer des Shops |
| `trackingNumber` | String? | Sendungsverfolgungsnummer |
| `carrier` | String? | z. B. `DHL`, `UPS`, `Hermes` |
| `price` | Float? | Gesamtbetrag |
| `currency` | String? | Standard: `EUR` |
| `status` | String | Aktueller Status (Werte siehe Abschnitt 8) |
| `orderDate` | DateTime? | Datum der Bestellung |
| `estimatedDelivery` | DateTime? | Voraussichtliche Lieferung |
| `subject` | String? | Originaler E-Mail-Betreff |
| `deliveryAddress` | String? | Lieferadresse (von GPT extrahiert) |
| `emailStatus` | String? | Rohstatus aus E-Mail (z. B. "zugestellt") |
| `rawEmailId` | String? | Legacy-Feld: `{uid}-{accountId}` |

### OrderEmail

Speichert die einzelnen E-Mail-Körper, die zu einer Bestellung gehören. Mehrere E-Mails mit gleicher Bestellnummer werden zusammengeführt, aber ihre Inhalte bleiben einzeln abrufbar.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | String (CUID) | Primärschlüssel |
| `orderId` | String | Fremdschlüssel → Order |
| `subject` | String? | E-Mail-Betreff (null wenn kein Betreff) |
| `fromAddress` | String? | Absender-Adresse |
| `receivedAt` | DateTime? | Eingangsdatum |
| `bodyText` | String? | Plaintext-Inhalt |
| `bodyHtml` | String? | HTML-Inhalt (wird im Frontend sanitiert) |

### OrderAttachment

Speichert PDF-Anhänge als Binärdaten in der Datenbank.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | String (CUID) | Primärschlüssel |
| `orderId` | String | Fremdschlüssel → Order |
| `filename` | String | Originaldateiname |
| `mimeType` | String | MIME-Typ (z. B. `application/pdf`) |
| `sizeBytes` | Int | Dateigröße in Bytes |
| `data` | Bytes | Binärdaten des Anhangs |

### TrackingEvent

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | String (CUID) | Primärschlüssel |
| `orderId` | String | Fremdschlüssel → Order |
| `timestamp` | DateTime | Zeitpunkt des Ereignisses |
| `location` | String? | Ort (z. B. `Frankfurt, Deutschland`) |
| `status` | String | Normalisierter Status-Key (z. B. `in transit`) |
| `description` | String | Beschreibungstext des Ereignisses |

### ProcessedEmail

Verhindert, dass dieselbe E-Mail mehrfach analysiert wird (Deduplizierung).

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | String (CUID) | Primärschlüssel |
| `userId` | String | Fremdschlüssel → User |
| `rawEmailId` | String | `{uid}-{accountId}` |
| `isOrder` | Boolean | War die E-Mail eine Bestellung? |
| `processedAt` | DateTime | Verarbeitungszeitpunkt |

**Unique-Constraint:** `(userId, rawEmailId)` – eine E-Mail kann pro Nutzer nur einmal verarbeitet werden.

**Cascade-Regeln:** Beim Löschen eines Users werden alle seine Daten mitgelöscht (EmailAccounts, Orders, TrackingEvents, OrderEmails, Attachments). Beim Löschen einer Bestellung werden TrackingEvents, OrderEmails und Attachments mitgelöscht.

---

## 4. Authentifizierung und Autorisierung

### JWT-Token-Fluss

```
Login-Anfrage (POST /api/auth/login)
  │
  ├── Zod-Validierung (E-Mail-Format, Passwort nicht leer)
  ├── User in DB suchen (per E-Mail)
  ├── bcrypt.compare(eingegebenes PW, gespeicherter Hash)
  ├── Bei Erfolg: jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' })
  └── Antwort: { token, user: { id, email, isTestUser, hasPaymentMethod } }
```

Das JWT läuft nach **7 Tagen** ab. Es gibt keine Refresh-Token-Logik.

### Middleware-Kette

**`requireAuth`** (`backend/src/middleware/auth.ts`):
```
Authorization-Header lesen → "Bearer <token>"
  ├── jwt.verify(token, JWT_SECRET)
  ├── Payload: { userId, email }
  ├── User aus DB laden (frisch, nicht aus Token-Cache)
  └── req.user = { id, email, isTestUser, hasPaymentMethod, stripeSubscriptionId }
```

**`requirePayment`** (`backend/src/middleware/auth.ts`):
```
req.user vorhanden?
  ├── isTestUser = true  → next() (Bypass)
  ├── hasPaymentMethod = true → next() (bezahlt)
  └── Sonst: Bestellungen zählen
        ├── Wie viele haben Status "delivered"?
        ├── < FREE_PROCESSED_ORDERS_LIMIT (Standard: 20)  → next()
        └── ≥ Limit → HTTP 402 { error, code: 'PAYMENT_REQUIRED' }
```

### Passwort-Reset-Prozess

```
1. POST /api/auth/forgot-password { email }
   ├── User suchen (kein Fehler bei unbekannter E-Mail → Sicherheit)
   ├── UUID-Token generieren
   ├── Ablaufzeit: jetzt + 3600000ms (1 Stunde)
   ├── Token + Ablauf in DB speichern
   └── E-Mail senden: {FRONTEND_URL}/reset-password?token={uuid}

2. POST /api/auth/reset-password { token, password }
   ├── User mit passendem Token UND Ablaufzeit > jetzt suchen
   ├── Neuen bcrypt-Hash erstellen
   ├── Hash speichern, Token + Ablaufzeit auf NULL setzen
   └── Erfolgsantwort
```

---

## 5. Zahlungssystem (Stripe)

**Datei:** `backend/src/routes/stripe.ts`

Das System nutzt **Stripe PaymentIntents** für eine einmalige Zahlung (kein Abo):

```
1. POST /api/stripe/create-payment-intent
   ├── Stripe-Kunde erstellen (falls nicht vorhanden)
   ├── PaymentIntent erstellen: Betrag = ONE_TIME_PAYMENT_AMOUNT_CENTS
   └── { clientSecret, amountCents, freeProcessedOrdersLimit }

2. Frontend: Stripe Elements → Nutzer gibt Kreditkartendaten ein
   └── stripe.confirmPayment(clientSecret, ...)

3. POST /api/stripe/confirm-one-time-payment { paymentIntentId }
   ├── paymentIntents.retrieve(id) → Status muss 'succeeded' sein
   ├── Kundenzugehörigkeit prüfen
   └── hasPaymentMethod = true in DB setzen

4. Stripe-Webhook POST /api/stripe/webhook
   ├── Signatur prüfen (STRIPE_WEBHOOK_SECRET)
   ├── 'payment_intent.succeeded' → hasPaymentMethod = true
   └── 'payment_intent.payment_failed' → hasPaymentMethod = false
```

**Demo-Modus:** Wenn `STRIPE_SECRET_KEY = sk_test_PLACEHOLDER`, wird Stripe deaktiviert. Mock-Zahlung via `mock_pi_`-Prefix möglich (nur außerhalb von `production`).

---

## 6. E-Mail-Integration (IMAP)

**Dateien:** `backend/src/services/imap.ts`, `backend/src/routes/emailAccounts.ts`

### Passwort-Verschlüsselung

IMAP-Passwörter werden XOR-verschlüsselt + Base64-kodiert gespeichert:

```
Verschlüsseln:
  Für jeden Buchstaben: ASCII-Wert XOR ASCII-Wert von JWT_SECRET (zyklisch)
  → Ergebnis als Base64-String

Entschlüsseln:
  Base64 dekodieren → gleiche XOR-Operation (XOR ist selbstinvers)
```

Der `JWT_SECRET` dient als Schlüssel. Ändert er sich, sind alle gespeicherten IMAP-Passwörter ungültig.

### Multi-Mailbox-IMAP-Abruf

```
fetchEmails(config, options):
  ├── ImapFlow-Client erstellen (SSL wenn Port 993)
  ├── client.connect()
  ├── Alle Postfächer auflisten: client.list()
  ├── Ordner filtern:
  │     ÜBERSPRINGEN wenn Flag in: \Trash \Drafts \Sent \Junk \Spam \Noselect
  │     ÜBERSPRINGEN wenn Name matched: trash, deleted, draft, sent,
  │                                     junk, spam, gesendet, gelöscht, ...
  │     ÜBERSPRINGEN wenn Pfad in blockedFolders (nutzerdefiniert)
  ├── Für jeden verbleibenden Ordner:
  │     Lock setzen → client.getMailboxLock(folder.path)
  │     ├── VOLLSYNC: Letzte N E-Mails per Sequenz-Range abrufen
  │     └── DELTASYNC: SEARCH SINCE {sinceDate} → nur neue UIDs
  │           → client.fetch(uids, { source: true })
  │           → simpleParser(source) → ParsedMail
  │                 subject, from, date, text, html
  │                 PDF-Anhänge extrahieren (contentType = application/pdf)
  │     Lock freigeben
  ├── client.logout()
  └── Alle E-Mails nach Datum sortiert zurückgeben (neueste zuerst)
```

**Vollsync vs. Deltasync:**
- **Erster Sync:** `sinceDate = jetzt − 2 Monate` → alle E-Mails der letzten 2 Monate
- **Folgende Syncs:** `sinceDate = lastSyncAt − 1 Stunde` → nur neue E-Mails (1h Überlappung als Puffer)

**Übersprungene Ordner:** System-Ordner wie Papierkorb, Gesendet, Entwürfe, Junk werden immer übersprungen – unabhängig von den Nutzereinstellungen. Nutzer können zusätzlich eigene Ordner über die Ordner-Verwaltung sperren (siehe Abschnitt 10).

### Deduplizierung via ProcessedEmail

```
getUnprocessedEmails(emails, userId, accountId):
  Für jede E-Mail:
    rawEmailId = email.uid + '-' + accountId
    ProcessedEmail in DB suchen:
      WHERE userId = ? AND rawEmailId = ?
    Gefunden? → überspringen
    Nicht gefunden? → in Ergebnisliste aufnehmen
```

Jede E-Mail wird **maximal einmal** analysiert und gespeichert, auch bei wiederholten Syncs.

### Bestellungs-Status ableiten

```
deriveStatus(trackingNumber, emailStatus, deliveryAddress):
  emailStatus vorhanden?
    → "packstation" in emailStatus? → 'in packstation'
    → "zugestellt/geliefert/delivered/..." → 'delivered'
    → "unterwegs/versandt/shipped/..." → 'in transit'
  Keine Tracking-Nummer? → 'delivered'
  Keine Lieferadresse? → 'delivered'
  Sonst → 'processing'
```

**Logik:** Bestellungen ohne Sendungsverfolgungsnummer oder Lieferadresse werden als bereits zugestellt/abgeschlossen behandelt.

### Automatisches Zusammenführen (Merge)

Wenn mehrere E-Mails dieselbe Bestellnummer enthalten, werden sie zu einer einzigen Bestellung zusammengeführt:

```
applyOrderInfo(email, rawEmailId, orderInfo, userId, accountId):
  ├── ProcessedEmail anlegen (verhindert erneute Analyse)
  ├── isOrder = false? → 'skipped'
  ├── orderNumber vorhanden?
  │     Bereits existierende Bestellung mit gleicher orderNumber?
  │       ├── Vorhandene Felder nicht überschreiben (null-coalescing)
  │       ├── Status neu ableiten
  │       ├── OrderEmail-Eintrag anlegen (E-Mail-Body wird gespeichert)
  │       ├── PDF-Anhänge speichern
  │       └── 'merged'
  └── Neue Bestellung anlegen:
        ├── Order-Datensatz erstellen
        ├── OrderEmail-Eintrag anlegen
        ├── PDF-Anhänge speichern
        └── 'new'
```

### Automatische Deduplizierung nach Sync

```
deduplicateOrders(userId):
  Alle Bestellungen des Users laden (mit orderNumber)
  Für jede Gruppe von Bestellungen mit gleicher orderNumber:
    ├── Älteste Bestellung = Primary
    ├── Tracking, Preis, Adresse aus allen zusammenführen
    ├── Status neu ableiten
    ├── TrackingEvents, OrderEmails, Attachments auf Primary umhängen
    └── Duplikate löschen
```

---

## 7. Bestellungserkennung (OpenAI Batch API)

**Datei:** `backend/src/services/openai.ts`

### Zweistufiger Ansatz

```
analyzeEmailsBatch(emails):
  ├── OpenAI konfiguriert? (OPENAI_API_KEY vorhanden)
  │   ├── JA → Batch API Ablauf (s. u.)
  │   └── NEIN / Fehler → Regelbasierter Fallback für alle E-Mails
  └── Ergebnisse als Map<uid, OrderInfo> zurückgeben
```

### OpenAI Batch API Ablauf

```
1. E-Mails vorbereiten (max. 50 pro Batch):
   cleanEmailText(email.text):
     ├── HTML-Tags und Entities entfernen
     ├── Trennlinien (----, ====) entfernen
     ├── Mehrfache Leerzeilen auf max. 2 reduzieren
     └── Zeilen trimmen

2. Batch-Requests erstellen:
   Für jede E-Mail:
     custom_id = Base64url(email.uid)  ← UID als Base64 kodiert
     body = {
       model: 'gpt-4o-mini',
       temperature: 0,
       response_format: { type: 'json_object' },
       max_tokens: 500,
       messages: [systemPrompt, { role: 'user', content: emailContent }]
     }

3. Batch-Datei hochladen:
   openai.files.create(jsonl-file, { purpose: 'batch' })

4. Batch starten:
   openai.batches.create({ input_file_id, endpoint: '/v1/chat/completions' })

5. Polling bis Batch fertig (alle 15 Sekunden, max. 30 Minuten):
   openai.batches.retrieve(batchId)
   Status: 'validating' | 'in_progress' | 'completed' | 'failed'

6. Ergebnisse abrufen:
   openai.files.content(outputFileId) → JSONL
   Für jedes Ergebnis:
     ├── custom_id → Base64url dekodieren → original UID
     ├── JSON parsen
     └── OrderInfo extrahieren
```

### Extrahierte Felder (GPT-Prompt)

Das GPT-Modell extrahiert folgende Felder aus jeder E-Mail:

| Feld | Beschreibung |
|------|--------------|
| `isOrder` | Boolean: Ist das eine Bestellungs-E-Mail? |
| `shop` | Shop-/Absendername |
| `orderNumber` | Bestellnummer |
| `price` | Gesamtpreis als Zahl |
| `currency` | Währungskürzel (z. B. EUR) |
| `carrier` | Paketdienstleister |
| `trackingNumber` | Sendungsverfolgungsnummer |
| `deliveryStatus` | Aktueller Lieferstatus als Text |
| `estimatedDelivery` | Voraussichtliches Lieferdatum (ISO 8601) |
| `deliveryAddress` | Vollständige Lieferadresse |
| `orderDate` | Bestelldatum (ISO 8601) |

### Regelbasierter Fallback

```
Wenn OpenAI nicht verfügbar:
  ├── Keyword-Suche in Betreff + Text:
  │     'bestellung', 'order', 'bestätigung', 'confirmation',
  │     'rechnung', 'invoice', 'versand', 'shipping', 'tracking', 'paket'
  ├── Kein Keyword → { isOrder: false }
  └── Tracking-Nummer extrahieren (Regex):
        - Ziffernfolgen 12–22 Zeichen
        - Internationales Format (AA123456789DE)
        - UPS-Format (1Z...)
        - "Sendungsnummer: XYZ"
```

---

## 8. Paketverfolgung (Carrier-Providers)

Das Tracking-System ist nach dem **Strategy-Pattern** aufgebaut.

### Tracking-Status

Die App kennt genau vier normalisierte Status-Werte:

| DB-Key | Anzeige-Label | Bedeutung |
|--------|--------------|-----------|
| `processing` | In Bearbeitung | Bestellung aufgegeben, noch nicht versendet |
| `in transit` | Im Versand | Paket ist unterwegs |
| `in packstation` | In Packstation | Paket liegt in einer Packstation/Abholstation |
| `delivered` | Zugestellt | Paket wurde zugestellt |

Alle Carrier-spezifischen Status-Texte werden auf diese vier Werte normalisiert. Ein ehemals vorhandener „Ausnahme"-Status (`exception`) wird ebenfalls auf `in transit` gemappt.

### Status-Normalisierung

**Datei:** `backend/src/services/tracking/normalization.ts`

```
normalizeCarrierStatus(rawStatus, statusMap):
  ├── rawStatus in statusMap nachschlagen (case-insensitiv)
  └── Nicht gefunden → 'unknown'

internalStatusToDb(internalStatus):
  ├── 'in_packstation' → 'in packstation'
  ├── 'delivered'      → 'delivered'
  ├── 'in_transit'     → 'in transit'
  ├── 'exception'      → 'in transit'  (kein eigener Status mehr)
  └── Sonstiges        → 'processing' / 'unknown'

detectPackstationFromDescription(description):
  → Regex: packstation|paketstation|parcel.?locker|abholstation
  → true/false
```

### Provider-Interface

```typescript
interface TrackingProvider {
  readonly carrierKeys: string[];       // z. B. ['dhl', 'deutsche post']
  readonly providerName: string;
  isConfigured(): boolean;
  fetchTracking(number: string): Promise<TrackingResult>;
}
```

### Orchestrator

**Datei:** `backend/src/services/tracking/orchestrator.ts`

```
fetchTrackingFromProvider(trackingNumber, carrier):
  ├── Provider anhand carrier-String finden (case-insensitiv)
  ├── Kein Provider → TrackingProviderError('not_found')
  ├── Nicht konfiguriert → TrackingProviderError('auth')
  ├── provider.fetchTracking(number)
  └── Events deduplizieren (Key: timestamp::status::location) + sortieren
```

### Verfügbare Provider

| Carrier | Env-Variable | API-Endpunkt |
|---------|-------------|--------------|
| DHL | `DHL_API_KEY` | `api-eu.dhl.com/track/shipments` |
| UPS | `UPS_CLIENT_ID` + `UPS_CLIENT_SECRET` | `onlinetools.ups.com/track/v1` |
| Hermes | `HERMES_API_KEY` | `api.myhermes.co.uk/track/v1` |
| DPD | `DPD_CLIENT_ID` + `DPD_CLIENT_SECRET` | `api.dpd.com/track/v1` |
| GLS | `GLS_API_USERNAME` + `GLS_API_PASSWORD` | `api.gls-group.eu/tracking/v1` |

### Fehlerbehandlung

```typescript
class TrackingProviderError extends Error {
  type: 'auth' | 'rate_limit' | 'not_found' | 'timeout' | 'network' | 'unknown';
  provider: string;
  retryable: boolean;
}
```

| Fehlertyp | HTTP-Status |
|-----------|-------------|
| `not_found` | 404 |
| `auth` | 502 (Provider-Konfigurationsfehler) |
| Sonstiges | 503 |

**Fallback-Modus:** `TRACKING_ENABLE_LEGACY_FALLBACK=true` aktiviert Mock-Daten bei Fehlern.

---

## 9. Automatische Hintergrundprozesse

### Tracking-Poller

**Datei:** `backend/src/services/tracking/poller.ts`

```
startTrackingPoller():
  ├── TRACKING_POLLING_ENABLED = 'true'? → Sonst nichts tun
  └── Alle 30 Minuten (TRACKING_POLLING_INTERVAL_MS):
        ├── Offene Bestellungen laden:
        │     WHERE trackingNumber IS NOT NULL
        │     AND status NOT IN ('delivered')
        │     LIMIT 100
        └── Für jede: refreshOrderTracking(orderId)
              ├── Tracking-Info vom Provider abrufen
              ├── prisma.$transaction:
              │     ├── Alte TrackingEvents löschen
              │     ├── Neue Events einfügen (createMany)
              │     └── Order.status + estimatedDelivery aktualisieren
              └── Fehler werden geloggt, nicht weitergereicht
```

Die `prisma.$transaction` stellt atomare Aktualisierungen sicher – kein inkonsistenter Zwischenzustand.

### E-Mail-Poller (stündlicher Auto-Sync)

**Datei:** `backend/src/services/emailPoller.ts`

```
startEmailPoller():
  └── Nach 1 Minute initialer Verzögerung:
        Jede Stunde (60 Minuten):
          runAutoSync()
            ├── Alle User aus DB laden
            └── Für jeden User: syncUserAccounts(userId)
```

**`syncUserAccounts(userId)`** (exportiert aus `routes/emailAccounts.ts`):

```
syncUserAccounts(userId):
  ├── Alle EmailAccounts des Users laden
  ├── Für jeden Account:
  │     password = decryptPassword(account.passwordEncrypted)
  │     blockedFolders = JSON.parse(account.blockedFolders)
  │     sinceDate = lastSyncAt − 1h  (oder 2 Monate wenn erster Sync)
  │     emails = fetchEmails(config, { sinceDate, blockedFolders })
  ├── Alle unverarbeiteten E-Mails sammeln (getUnprocessedEmails)
  ├── Batch-Analyse via OpenAI (analyzeEmailsBatch)
  ├── Ergebnisse speichern (applyOrderInfo je E-Mail)
  ├── lastSyncAt für alle Accounts aktualisieren
  └── deduplicateOrders(userId) aufrufen
```

Diese Funktion wird auch von den manuellen Sync-Endpunkten genutzt.

---

## 10. Ordner-Verwaltung pro E-Mail-Konto

**Datei:** `backend/src/routes/emailAccounts.ts`

Jeder Nutzer kann pro E-Mail-Konto festlegen, welche Ordner beim Sync **nicht** ausgelesen werden sollen. Dies ermöglicht das Schützen von privaten Ordnern.

### API-Endpunkte

**`GET /api/email-accounts/:id/folders`**
```
├── IMAP-Verbindung aufbauen
├── Alle Ordner auflisten: listFolders(config, blockedFolders)
│     Für jeden Ordner: { path, name, isBlocked }
└── { folders: FolderInfo[], blockedFolders: string[] }
```

**`PATCH /api/email-accounts/:id`**
```
Body: { blockedFolders: string[] }
├── Zod-Validierung
└── account.blockedFolders = JSON.stringify(blockedFolders) in DB speichern
```

### Ordner-Filter-Logik

Beim Sync werden Ordner nach drei unabhängigen Regeln übersprungen:

1. **System-Flags:** `\Trash`, `\Drafts`, `\Sent`, `\Junk`, `\Spam`, `\Noselect`
2. **Name-Patterns:** trash, deleted, draft, sent, junk, spam (regex, case-insensitiv)
3. **Nutzer-Sperrliste:** Pfad des Ordners ist in `account.blockedFolders` enthalten

Regeln 1 und 2 können vom Nutzer **nicht** deaktiviert werden – System-Ordner werden immer übersprungen.

### Frontend-Komponente

**`FolderManagerModal.tsx`:**
- Bottom-Sheet-Modal mit vollständiger Ordnerliste
- Grüne Ordner = aktiv (werden synchronisiert)
- Rote Ordner = gesperrt (werden niemals synchronisiert)
- Tippen auf einen Ordner wechselt den Status
- „Speichern" sendet die neue Liste per PATCH ans Backend
- Zugänglich über den Ordner-Button (indigo) in der `EmailAccountCard`

---

## 11. XSS-Schutz und Sicherheitsmaßnahmen

### Problem: HTML-E-Mails

E-Mail-Inhalte werden als HTML im Browser angezeigt. Ohne Schutz könnten manipulierte E-Mails JavaScript ausführen und z. B. den JWT-Token aus `localStorage` stehlen.

### Maßnahme 1: DOMPurify-Sanitierung (Frontend)

**Datei:** `frontend/src/pages/OrderDetail.tsx`

```javascript
DOMPurify.sanitize(rawHtml, {
  FORBID_TAGS: ['script', 'style', 'link', 'meta', 'base', 'form',
                'input', 'button', 'iframe', 'object', 'embed', ...],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'action', 'srcdoc',
                'href', 'src', ...],
  ALLOW_DATA_ATTR: false,
  FORCE_BODY: true,
})
```

Alle `<script>`-Tags, Event-Handler-Attribute und gefährliche HTML-Elemente werden **vor** der Anzeige entfernt.

### Maßnahme 2: Sicherer iframe-Sandbox

Das bereinigte HTML wird in einem `<iframe>` mit restriktivem `sandbox`-Attribut angezeigt:

```html
<iframe
  srcDoc={buildSafeEmailDocument(html)}
  sandbox="allow-popups allow-popups-to-escape-sandbox"
  referrerPolicy="no-referrer"
/>
```

| Fehlende Permission | Schutz |
|---------------------|--------|
| Kein `allow-scripts` | JavaScript im iframe wird vom Browser vollständig blockiert |
| Kein `allow-same-origin` | Das iframe kann **nicht** auf Cookies, localStorage oder den Parent-DOM zugreifen |
| Kein `allow-forms` | Formulare können nicht abgeschickt werden |

`allow-popups` und `allow-popups-to-escape-sandbox` erlauben es, dass Links aus E-Mails in einem neuen Tab geöffnet werden können.

### Maßnahme 3: Meta-CSP im E-Mail-Dokument

Das E-Mail-HTML wird in ein vollständiges HTML-Dokument mit eigenem CSP-Meta-Tag eingebettet:

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline'; img-src data: cid:;">
```

Nur Inline-Styles und Base64-Bilder (CID) sind erlaubt. Keine externen Ressourcen, keine Skripte.

### Maßnahme 4: Security-Header im Backend

Alle API-Antworten des Express-Servers enthalten folgende Security-Header:

| Header | Wert | Schutz |
|--------|------|--------|
| `X-Content-Type-Options` | `nosniff` | Verhindert MIME-Type-Sniffing |
| `X-Frame-Options` | `DENY` | Kein Einbetten der App in fremde Frames (Clickjacking) |
| `X-XSS-Protection` | `1; mode=block` | XSS-Filter älterer Browser aktivieren |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Keine URL-Leaks an externe Seiten |
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'` | API-Antworten nicht als Webseite ausführbar |

---

## 12. Frontend – Aufbau und Routing

**Datei:** `frontend/src/App.tsx`

### Routen-Übersicht

| Pfad | Komponente | Zugriffsschutz |
|------|-----------|----------------|
| `/login` | `Login` | PublicOnly |
| `/register` | `Register` | PublicOnly |
| `/forgot-password` | `ForgotPassword` | Öffentlich |
| `/reset-password?token=...` | `ResetPassword` | Öffentlich |
| `/payment-setup` | `PaymentSetup` | PrivateRoute |
| `/` | `Home` | PrivateRoute |
| `/orders/:id` | `OrderDetail` | PrivateRoute |

### Seiten-Übersicht

**`Home.tsx`** – Hauptseite mit zwei Tabs (E-Mail-Konten / Bestellungen):

- **E-Mail-Konten-Tab:** Liste aller verbundenen Konten als `EmailAccountCard`
- **Bestellungen-Tab (`OrdersTab`):**
  - Status-Filter-Chips (Alle / In Bearbeitung / Im Versand / In Packstation / Zugestellt)
  - Umschalter: Nach Monat oder Nach Anbieter gruppieren
  - Accordion-Gruppen: immer nur eine Gruppe offen
  - Beim ersten Laden öffnet die erste Gruppe automatisch
  - Offene Gruppe wird in `localStorage` gespeichert und beim nächsten Besuch wiederhergestellt
  - Beim Wechsel von Gruppierungsmodus oder Filter öffnet die erste neue Gruppe automatisch
  - Sticky Gruppen-Header beim Scrollen innerhalb einer offenen Gruppe

**`OrderDetail.tsx`** – Detailansicht einer Bestellung:

- Bestellkopf (Shop, Bestellnummer, Preis, Datum, Adresse)
- Inline-Bearbeitungsformular (direkt unter dem Kopf): Tracking-Nummer, Carrier, Status
- Tracking-Timeline (nur wenn Tracking-Nummer vorhanden)
- PDF-Anhänge: Vorschau via Blob-URL (authentifizierter Download), Download-Button
- E-Mail-Sektion: Alle zur Bestellung gehörenden E-Mails als aufklappbare Blöcke
  - HTML-E-Mails: DOMPurify-sanitiert, im sicheren iframe
  - Text-E-Mails: `<pre>`-Block

### Komponentenübersicht

| Komponente | Datei | Aufgabe |
|-----------|-------|---------|
| `BottomNav` | `components/BottomNav.tsx` | Tab-Navigation (E-Mails / Bestellungen / Einstellungen) |
| `EmailAccountCard` | `components/EmailAccountCard.tsx` | Konto-Kachel mit Sync / Ordner / Resync / Löschen |
| `FolderManagerModal` | `components/FolderManagerModal.tsx` | Bottom-Sheet zur Ordner-Verwaltung |
| `OrderCard` | `components/OrderCard.tsx` | Bestellungs-Listeneintrag |
| `StatusBadge` | `components/StatusBadge.tsx` | Farbiger Status-Chip (4 Status) |
| `AddEmailAccountModal` | `components/AddEmailAccountModal.tsx` | Bottom-Sheet: Konto hinzufügen |
| `SettingsModal` | `components/SettingsModal.tsx` | Bottom-Sheet: PW-Änderung + Logout |

### Accordion-Logik (Bestellungsliste)

```
Beim ersten Rendern (initializedRef.current = false):
  ├── Gespeicherten Key aus localStorage lesen
  ├── Key noch in aktiven Gruppen vorhanden? → öffnen
  └── Sonst: erste Gruppe öffnen
  initializedRef.current = true

Beim Wechsel von groupByShop oder activeFilter:
  └── Erste Gruppe der neuen Ansicht automatisch öffnen

handleToggleGroup(key):
  ├── Gruppe ist offen (prev === key)?
  │     → null (schließen – kein Zwang mehr, eine offen zu halten)
  └── Andere Gruppe?
        → key (öffnen, vorherige schließt sich automatisch)
```

---

## 13. State Management (Zustand)

**Datei:** `frontend/src/store/authStore.ts`

```typescript
{
  user: User | null        // { id, email, isTestUser, hasPaymentMethod }
  token: string | null     // JWT-Token

  setAuth(user, token)     // nach Login/Register
  updateUser(partial)      // z. B. hasPaymentMethod nach Zahlung
  logout()                 // alles löschen
}
```

**Persistenz:** Token und User werden in `localStorage` gespeichert. Der Store initialisiert sich beim Start aus `localStorage` → Session bleibt über Browser-Neustarts erhalten (bis JWT abläuft, 7 Tage).

---

## 14. API-Client (Axios)

**Datei:** `frontend/src/api/client.ts`

```
Axios-Instanz mit baseURL: '/api'
  ├── Request-Interceptor:
  │     JWT aus localStorage lesen
  │     → Authorization: Bearer <token> Header setzen
  └── Response-Interceptor:
        HTTP 401?
          ├── Token + User aus localStorage löschen
          └── window.location.href = '/login'
```

### API-Dateien

| Datei | Endpunkte |
|-------|-----------|
| `api/auth.ts` | Register, Login, Passwort-Reset |
| `api/emailAccounts.ts` | Konten CRUD, Sync, Resync, Ordner-Verwaltung |
| `api/orders.ts` | Bestellungen lesen, Tracking, manuelles Update |
| `api/attachments.ts` | PDF-Blob-URL abrufen, authentifizierter Download |
| `api/stripe.ts` | PaymentIntent erstellen, Zahlung bestätigen |

---

## 15. Vollständige Prozessketten

### Prozess 1: Nutzer registriert sich

```
Register.tsx → POST /api/auth/register
  ├── Zod-Validierung + Duplikatprüfung
  ├── bcrypt.hash(password, 12)
  ├── prisma.user.create(...)
  ├── jwt.sign({ userId, email }, '7d')
  └── { token, user }

Frontend:
  ├── useAuthStore.setAuth(user, token) → localStorage
  └── navigate('/payment-setup')
```

### Prozess 2: E-Mail-Konto verbinden und ersten Sync starten

```
AddEmailAccountModal → POST /api/email-accounts
  ├── testImapConnection(config) → ImapFlow connect/logout
  │     Fehler → 400 mit spezifischer Fehlermeldung
  ├── encryptPassword(password) → XOR + Base64
  └── prisma.emailAccount.create(...)

POST /api/email-accounts/:id/sync
  ├── blockedFolders = JSON.parse(account.blockedFolders)
  ├── fetchEmails(config, { sinceDate: 2 Monate, blockedFolders })
  │     Alle Ordner (außer System + gesperrte)
  ├── getUnprocessedEmails → nur neue
  ├── analyzeEmailsBatch → OpenAI Batch API
  │     Batch hochladen → polling → Ergebnisse auslesen
  ├── applyOrderInfo für jede erkannte Bestellung
  │     OrderEmail-Eintrag anlegen, Anhänge speichern
  ├── lastSyncAt aktualisieren
  └── deduplicateOrders → gleiche Bestellnummern zusammenführen
```

### Prozess 3: Stündlicher automatischer Sync

```
emailPoller.ts (Hintergrund, alle 60 Minuten):
  └── Alle User aus DB
        └── syncUserAccounts(userId):
              Alle Accounts → fetchEmails (Deltasync, nur neue)
              → analyzeEmailsBatch
              → applyOrderInfo
              → lastSyncAt aktualisieren
              → deduplicateOrders
```

### Prozess 4: Tracking einer Bestellung abrufen

```
OrderDetail.tsx → POST /api/orders/:id/refresh-tracking
  ├── Order laden (userId-Prüfung)
  ├── fetchTrackingFromProvider(trackingNumber, carrier)
  │     Provider finden → API-Aufruf → Normalisierung
  │     Status-Map: alle Carrier-Status → 'in transit'/'delivered'/...
  │     detectPackstationFromDescription → 'in packstation'
  ├── prisma.$transaction:
  │     ├── Alte TrackingEvents löschen
  │     ├── Neue Events einfügen
  │     └── Order.status + estimatedDelivery aktualisieren
  └── Aktualisierte Order zurückgeben
```

### Prozess 5: Bestellung manuell bearbeiten

```
OrderDetail.tsx (Bearbeitungs-Formular) → PATCH /api/orders/:id
  Body: { trackingNumber?, carrier?, status? }
  ├── Order laden (userId-Prüfung)
  ├── Felder aktualisieren
  ├── trackingNumber geändert? → refreshOrderTracking aufrufen
  └── Aktualisierte Order zurückgeben

Frontend:
  ├── order state aktualisieren
  └── editing = false (Formular schließen)
```

### Prozess 6: Ordner für Konto sperren

```
EmailAccountCard → FolderManagerModal
  ├── GET /api/email-accounts/:id/folders
  │     IMAP-Login → client.list() → alle Ordner
  │     isBlocked = folder.path in blockedFolders
  │     client.logout()
  │     { folders, blockedFolders }
  ├── Nutzer aktiviert/deaktiviert Ordner (Toggle)
  └── PATCH /api/email-accounts/:id { blockedFolders: [...] }
        → account.blockedFolders = JSON.stringify([...])
        Beim nächsten Sync werden gesperrte Ordner übersprungen
```

### Prozess 7: HTML-E-Mail sicher anzeigen

```
OrderDetail.tsx → EmailBodyContent({ html })
  ├── DOMPurify.sanitize(html):
  │     Scripts, Event-Handler, gefährliche Tags entfernen
  ├── buildSafeEmailDocument(clean):
  │     In vollständiges HTML-Dokument einbetten
  │     Meta-CSP: default-src 'none'; style-src 'unsafe-inline'
  └── <iframe
        srcDoc={safeDocument}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
      />
      → Browser blockiert alle Scripts + Same-Origin-Zugriff
```

---

## 16. Umgebungsvariablen-Referenz

Alle Variablen werden in `backend/.env` gesetzt.

### Pflicht

| Variable | Beschreibung |
|----------|-------------|
| `JWT_SECRET` | Geheimer Schlüssel für JWT-Signing und IMAP-PW-Verschlüsselung |
| `DATABASE_URL` | Prisma-Verbindungsstring (Standard: `file:./dev.db`) |

### Server

| Variable | Standard | Beschreibung |
|----------|---------|-------------|
| `PORT` | `3001` | Express-Server-Port |
| `NODE_ENV` | `development` | Steuert Mock-Zahlung in Produktion |
| `FRONTEND_URL` | `http://localhost:5173` | CORS-Erlaubnis + Passwort-Reset-Link |

### Stripe (optional)

| Variable | Standard | Beschreibung |
|----------|---------|-------------|
| `STRIPE_SECRET_KEY` | `sk_test_PLACEHOLDER` | Stripe API-Schlüssel (Backend) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_PLACEHOLDER` | Webhook-Signaturprüfung |
| `ONE_TIME_PAYMENT_AMOUNT_CENTS` | `1000` | Einmalzahlung in Cent (1000 = 10 EUR) |
| `FREE_PROCESSED_ORDERS_LIMIT` | `20` | Freie abgeschlossene Bestellungen |

### OpenAI

| Variable | Standard | Beschreibung |
|----------|---------|-------------|
| `OPENAI_API_KEY` | `sk-PLACEHOLDER` | OpenAI API-Key für GPT-4o-mini + Batch API |

### Carrier-APIs (alle optional)

| Variable | Carrier |
|----------|---------|
| `DHL_API_KEY` | DHL |
| `UPS_CLIENT_ID` + `UPS_CLIENT_SECRET` | UPS |
| `HERMES_API_KEY` | Hermes |
| `DPD_CLIENT_ID` + `DPD_CLIENT_SECRET` | DPD |
| `GLS_API_USERNAME` + `GLS_API_PASSWORD` | GLS |

### Tracking-Verhalten

| Variable | Standard | Beschreibung |
|----------|---------|-------------|
| `TRACKING_POLLING_ENABLED` | `false` | Automatischer Hintergrund-Poller |
| `TRACKING_POLLING_INTERVAL_MS` | `1800000` | Polling-Intervall (30 Minuten) |
| `TRACKING_PROVIDER_TIMEOUT_MS` | `12000` | HTTP-Timeout für Carrier-APIs |
| `TRACKING_ENABLE_LEGACY_FALLBACK` | `false` | Mock-Daten bei Carrier-Fehler |

### E-Mail / SMTP (optional, nur für Passwort-Reset)

| Variable | Standard | Beschreibung |
|----------|---------|-------------|
| `SMTP_HOST` | `smtp.gmail.com` | SMTP-Server |
| `SMTP_PORT` | `587` | SMTP-Port |
| `SMTP_USER` | – | Absender-Login |
| `SMTP_PASS` | – | Passwort / App-Passwort |
| `SMTP_FROM` | `noreply@paketdienst.app` | Absender-Adresse |

### Frontend

| Variable | Datei | Beschreibung |
|----------|-------|-------------|
| `VITE_STRIPE_PUBLISHABLE_KEY` | `frontend/.env` | Stripe Public Key für Stripe.js |

---

## Sicherheitshinweise

1. **JWT_SECRET:** Muss lang und zufällig sein. Änderung macht alle bestehenden Sessions und alle gespeicherten IMAP-Passwörter ungültig.
2. **IMAP-Passwörter:** Die XOR-Verschlüsselung ist kein kryptographisch starker Schutz. Für Produktion AES-256-GCM aus der Node.js `crypto`-Bibliothek verwenden.
3. **HTML-E-Mails:** Werden durch DOMPurify + sicherer iframe-Sandbox geschützt (kein `allow-same-origin`, kein `allow-scripts`).
4. **Passwort-Reset:** Die API verrät nicht, ob eine E-Mail-Adresse registriert ist (gleiche Antwort für bekannte und unbekannte Adressen).
5. **Datenbankzugriff:** Alle Abfragen prüfen die `userId` – kein Cross-User-Datenzugriff möglich.
6. **Stripe-Webhooks:** Signaturprüfung verhindert gefälschte Zahlungsbestätigungen.
7. **Security-Header:** Alle API-Antworten enthalten `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` und einen restriktiven CSP.
8. **blockedFolders:** Nutzer können sensitive Ordner explizit von der Synchronisierung ausschließen. System-Ordner (Junk, Sent, Trash etc.) werden unabhängig davon immer übersprungen.
