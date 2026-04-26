# GESTISCIME — Prelaunch landing page

> Il pilota automatico per il tuo patrimonio.
> Landing page di pre-lancio con raccolta email sicura su Supabase.

**Live:** [https://gestisci.me](https://gestisci.me) (dopo il setup DNS qui sotto)

---

## Sommario

1. [Cosa contiene il repo](#cosa-contiene-il-repo)
2. [Architettura della sicurezza](#architettura-della-sicurezza)
3. [Setup completo (passo-passo)](#setup-completo-passo-passo)
   - [Step 1 · Crea il progetto Supabase](#step-1--crea-il-progetto-supabase)
   - [Step 2 · Esegui lo schema SQL](#step-2--esegui-lo-schema-sql)
   - [Step 3 · Inserisci le credenziali nel sito](#step-3--inserisci-le-credenziali-nel-sito)
   - [Step 4 · Pubblica il repo su GitHub](#step-4--pubblica-il-repo-su-github)
   - [Step 5 · Attiva GitHub Pages](#step-5--attiva-github-pages)
   - [Step 6 · Configura il DNS su register.it](#step-6--configura-il-dns-su-registerit)
   - [Step 7 · Forza HTTPS](#step-7--forza-https)
4. [Come leggere ed esportare le email iscritte](#come-leggere-ed-esportare-le-email-iscritte)
5. [Test locale](#test-locale)
6. [SEO checklist](#seo-checklist)
7. [Troubleshooting](#troubleshooting)
8. [Stack tecnologico](#stack-tecnologico)

---

## Cosa contiene il repo

```
gestiscime/
├── index.html              ← landing principale (SEO completo + schema.org)
├── privacy.html            ← informativa privacy GDPR
├── terms.html              ← termini di servizio
├── cookies.html            ← cookie policy
├── 404.html                ← pagina di errore
├── robots.txt              ← regole crawler (AI bots permessi per GEO)
├── sitemap.xml             ← indicizzazione Google
├── manifest.json           ← PWA manifest
├── humans.txt
├── CNAME                   ← dice a GitHub Pages quale dominio usare → gestisci.me
├── .gitignore
├── .well-known/
│   └── security.txt        ← RFC 9116 (responsible disclosure)
├── .github/workflows/
│   └── deploy.yml          ← deploy automatico ad ogni push su main
├── assets/
│   ├── css/
│   │   ├── style.css       ← palette aubergine + arancio bruciato
│   │   └── legal.css
│   ├── js/
│   │   ├── config.js       ← ⚠️ DA MODIFICARE: chiavi Supabase
│   │   └── main.js
│   └── images/
│       ├── favicon.svg
│       ├── og-image.png    ← anteprima social 1200×630
│       ├── icon-192.png · icon-512.png · apple-touch-icon.png · logo.png
└── supabase/
    └── schema.sql          ← 👑 da eseguire UNA VOLTA su Supabase
```

---

## Architettura della sicurezza

> **TL;DR.** Anche se qualcuno forka il repo, vede tutto il codice e copia
> le tue chiavi Supabase, **non può leggere nemmeno una email** del tuo database.
> Può solo aggiungerne di nuove. Solo tu, dalla dashboard Supabase, puoi leggere.

### Come funziona

#### 1 · Due chiavi Supabase, due ruoli completamente diversi

| Chiave | Dove vive | Cosa può fare |
|---|---|---|
| `anon` (public) | Nel JS del browser, in `assets/js/config.js`, sul repo pubblico | Solo `INSERT` sulla tabella `waitlist`, niente altro |
| `service_role` | **Solo** nella dashboard Supabase, **mai** nel codice | Tutto, bypassa la RLS |

Questo è il design ufficiale di Supabase: la `anon` key **è progettata per essere pubblica**.

#### 2 · Row Level Security (RLS) sulla tabella `waitlist`

Lo schema SQL crea una sola policy:

```sql
create policy "Anyone can subscribe"
  on public.waitlist
  for insert            -- ← solo INSERT
  to anon, authenticated
  with check (
    email is not null
    and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'
    and char_length(email) <= 254
    -- ...altri check di lunghezza
  );
```

Senza policy per `SELECT`, `UPDATE` o `DELETE`, queste operazioni sono **negate per default**.

#### 3 · `revoke all` come cintura di sicurezza

Anche se per errore disabilitassi la RLS, lo script revoca esplicitamente tutti i privilegi sulla tabella e concede solo `INSERT` colonna per colonna:

```sql
revoke all on public.waitlist from anon;
revoke all on public.waitlist from authenticated;
grant insert (email, source, user_agent, referrer, locale) on public.waitlist to anon;
```

#### 4 · Trigger di rate limit a livello DB

Massimo 200 inserimenti/ora globali. Se un bot prova a riempire il database, le transazioni successive falliscono finché non passa l'ora.

#### 5 · Validazione formato email a livello DB

La `WITH CHECK` clause rifiuta stringhe non-email prima ancora che entrino in tabella.

#### 6 · Anti-bot lato client

- **Honeypot**: campo nascosto `<input name="website">` — se compilato, il bot pensa di aver vinto, ma noi ignoriamo.
- **Tempo minimo di compilazione**: 1.5 secondi tra render del form e submit.
- **Rate limit `localStorage`**: massimo 3 iscrizioni/ora per dispositivo.

---

## Setup completo (passo-passo)

### Step 1 · Crea il progetto Supabase

1. Vai su [supabase.com](https://supabase.com) e fai login (free tier basta).
2. Click **New project**:
   - **Name**: `gestiscime`
   - **Database password**: generane una forte (24+ caratteri) e salvala in un password manager.
   - **Region**: `Frankfurt (eu-central-1)` ← server in UE = compliance GDPR.
   - **Pricing plan**: Free.
3. Aspetta 1-2 minuti che il database sia pronto.

### Step 2 · Esegui lo schema SQL

1. Nella dashboard Supabase, sidebar a sinistra → **SQL Editor** → **+ New query**.
2. Apri il file `supabase/schema.sql` di questo repo.
3. **Copia tutto** il contenuto e incollalo nell'editor.
4. Click **Run** (oppure `Ctrl+Enter` / `Cmd+Enter`).
5. Dovresti vedere `Success. No rows returned`.

Verifica veloce:
- Sidebar → **Table Editor** → dovresti vedere la tabella `waitlist` (vuota).
- Sidebar → **Authentication** → **Policies** → tabella `waitlist` → deve esserci **una sola** policy chiamata `Anyone can subscribe`.

### Step 3 · Inserisci le credenziali nel sito

1. Nella dashboard Supabase, **Settings** (in basso a sinistra) → **API**.
2. Copia due valori:
   - **Project URL** → es. `https://abcdefghijk.supabase.co`
   - **Project API keys** → quella **`anon` `public`** (NON la `service_role`!)
3. Apri `assets/js/config.js` e sostituisci:

```javascript
window.GESTISCIME_CONFIG = {
  SUPABASE_URL: "https://abcdefghijk.supabase.co",        // ← incolla qui
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6...",   // ← e qui
  WAITLIST_TABLE: "waitlist",
  SOURCE: "homepage",
};
```

> **ATTENZIONE**: **non incollare mai** la `service_role` key — quella va tenuta solo nella dashboard Supabase. Se la committassi, chiunque potrebbe leggere e cancellare la lista.

### Step 4 · Pubblica il repo su GitHub

```bash
cd gestiscime
git init
git add .
git commit -m "Initial commit: GESTISCIME prelaunch"
git branch -M main

# Crea il repo su github.com (può essere pubblico — le chiavi anon vanno bene esposte)
git remote add origin https://github.com/TUO-USERNAME/gestiscime.git
git push -u origin main
```

### Step 5 · Attiva GitHub Pages

1. Sul repo GitHub → **Settings** → **Pages** (sidebar).
2. **Source**: scegli **GitHub Actions** (NON "Deploy from a branch").
3. Vai sul tab **Actions** del repo: vedrai partire il workflow "Deploy to GitHub Pages".
4. Dopo ~1 minuto, il primo deploy è fatto. La URL temporanea sarà `https://TUO-USERNAME.github.io/gestiscime/` (ma noi useremo il dominio custom).

### Step 6 · Configura il DNS su register.it

Hai già un dominio `gestisci.me` su register.it. Devi solo modificare alcuni record DNS — gli altri (MX per email, autoconfig, pop) **lasciali invariati**, così la posta continua a funzionare.

**Modifiche da fare nella sezione "Elenco DNS"**:

| Azione | Nome | Tipo | Valore | Note |
|---|---|---|---|---|
| 🗑️ **Cancella** | `gestisci.me` | A | `195.110.124.133` | il vecchio parking di register |
| ➕ **Aggiungi** | `gestisci.me` | A | `185.199.108.153` | GitHub Pages #1 |
| ➕ **Aggiungi** | `gestisci.me` | A | `185.199.109.153` | GitHub Pages #2 |
| ➕ **Aggiungi** | `gestisci.me` | A | `185.199.110.153` | GitHub Pages #3 |
| ➕ **Aggiungi** | `gestisci.me` | A | `185.199.111.153` | GitHub Pages #4 |
| ✏️ **Modifica** | `www.gestisci.me` | CNAME | `TUO-USERNAME.github.io.` | metti il TUO username GitHub, con il punto finale |

**Da NON toccare** (servono per la mail):
- `autoconfig.gestisci.me` CNAME `tb-it.securemail.pro`
- `ftp.gestisci.me` CNAME `gestisci.me`
- `pop.gestisci.me` CNAME `mail.register.it`
- `gestisci.me` MX 10 `mail.register.it`
- `pec.gestisci.me` MX 10 `server.pec-email.com`

> **Procedura su register.it** (UI dello screenshot):
> 1. Pannello di controllo → dominio `gestisci.me` → **Gestione DNS** → tab **Gestione guidata**.
> 2. Click **Cancella** sulla riga del record `A` esistente (`195.110.124.133`).
> 3. Click **+ INSERISCI A RECORD** quattro volte, una per ciascuno dei quattro IP di GitHub Pages elencati sopra (lascia il campo "nome" vuoto o metti `@` per riferirsi all'apex `gestisci.me`).
> 4. Modifica il CNAME esistente di `www`: cambia il valore da `gestisci.me` a `TUO-USERNAME.github.io.` (con il punto finale, IMPORTANTE).
> 5. Salva.

**Tempo di propagazione**: 15 minuti – 24 ore (di solito molto meno con register.it).

Verifica con:
```bash
dig +short gestisci.me
# deve restituire: 185.199.108.153 ... 185.199.111.153
```
oppure su [dnschecker.org](https://dnschecker.org).

### Step 7 · Forza HTTPS

Una volta che il DNS è propagato:
1. Repo GitHub → **Settings** → **Pages**.
2. Nel campo **Custom domain** dovresti già vedere `gestisci.me` (preso dal CNAME nel repo).
3. Aspetta che la verifica di GitHub completi (qualche minuto).
4. Quando il check verde appare, spunta la casella **Enforce HTTPS**.
5. GitHub emette automaticamente un certificato Let's Encrypt — il sito sarà servito su HTTPS in pochi minuti.

🎉 **Fatto.** Ora `https://gestisci.me` funziona, raccoglie email, è ottimizzato SEO e chiunque tranne te (con la `service_role`) non può leggere nulla.

---

## Come leggere ed esportare le email iscritte

### Visualizzazione

Dashboard Supabase → **Table Editor** → seleziona `waitlist` → vedi tutte le iscrizioni in ordine cronologico.

### Esportazione CSV

Sopra la tabella, click sui tre puntini `⋯` → **Export to CSV**.

### Query SQL ad-hoc

Sidebar → **SQL Editor** → esempio:

```sql
-- Iscrizioni delle ultime 24 ore
select email, source, created_at
from public.waitlist
where created_at > now() - interval '1 day'
order by created_at desc;

-- Conta per fonte
select source, count(*) as n
from public.waitlist
group by source
order by n desc;

-- Esporta in formato compatibile email marketing
select email, to_char(created_at, 'YYYY-MM-DD') as iscrizione
from public.waitlist
order by created_at;
```

---

## Test locale

Il sito è 100% statico — basta servirlo con un qualsiasi web server (NON aprire `index.html` con `file://`, perché il fetch verso Supabase non funzionerebbe per via di CORS).

```bash
# Python (preinstallato su macOS/Linux)
python3 -m http.server 8000

# oppure Node:
npx serve .

# oppure VS Code:
# installa l'estensione "Live Server" e click destro → Open with Live Server
```

Apri [http://localhost:8000](http://localhost:8000), prova a iscriverti — l'email dovrebbe comparire nella tua tabella `waitlist` su Supabase entro pochi secondi.

---

## SEO checklist

Tutto già implementato in `index.html`:

- ✅ `<title>` ottimizzato (60 char), `<meta description>` (155 char)
- ✅ `<link rel="canonical">` per evitare duplicati
- ✅ `hreflang` `it`, `it-IT`, `x-default`
- ✅ Open Graph + Twitter Cards (immagine `og-image.png` 1200×630)
- ✅ JSON-LD: `Organization`, `WebSite`, `SoftwareApplication`, `FAQPage`, `BreadcrumbList`
- ✅ `robots.txt` con AI crawler permessi (GPTBot, ClaudeBot, PerplexityBot, ecc.) per la GEO/AI Overviews
- ✅ `sitemap.xml` con `<lastmod>`, `<changefreq>`, `<priority>`
- ✅ `manifest.json` PWA
- ✅ Core Web Vitals friendly (zero JS bloccante, font con `display=swap`, immagini SVG)
- ✅ Geo meta tag `IT`
- ✅ `theme-color` per la status bar mobile
- ✅ Skip link, `aria-*`, ruoli ARIA → accessibilità A11Y

**Da fare DOPO il deploy iniziale**:

1. **Google Search Console** ([search.google.com/search-console](https://search.google.com/search-console)):
   - Aggiungi `gestisci.me` come property
   - Verifica ownership tramite record TXT (te lo fa fare register.it senza problemi)
   - Submit della sitemap: `https://gestisci.me/sitemap.xml`
2. **Bing Webmaster Tools** (importa direttamente da Search Console)
3. **Indicizzazione richiesta**: in Search Console → "Inspect URL" → richiedi indicizzazione manuale di `https://gestisci.me/`
4. (Opzionale) Esegui un audit con [`claude-seo`](https://github.com/AgriciDaniel/claude-seo):
   ```bash
   /seo audit https://gestisci.me
   ```

---

## Troubleshooting

| Problema | Causa probabile | Soluzione |
|---|---|---|
| Form mostra "Configurazione del sito non completata" | Hai dimenticato di modificare `assets/js/config.js` | Inserisci `SUPABASE_URL` e `SUPABASE_ANON_KEY` reali |
| Form mostra "Errore 401" | Hai usato la chiave sbagliata | Devi usare la `anon public`, non la `service_role` |
| Form mostra "Errore 403" | RLS non configurata | Riesegui `supabase/schema.sql` nel SQL Editor |
| Nessuna email arriva su Supabase ma il form dice "successo" | Honeypot triggered o tempo troppo breve | Compila più lentamente (>1.5s) |
| GitHub Pages mostra 404 | Workflow non ancora completato, oppure `Source` non è "GitHub Actions" | Settings → Pages → Source → GitHub Actions; aspetta il workflow |
| "Domain not properly configured" su Settings → Pages | DNS non ancora propagato | Aspetta fino a 24h, verifica con `dig` |
| Mail non funziona dopo il cambio DNS | Hai cancellato per errore i record MX | Ripristina MX `mail.register.it` priorità 10 |
| HTTPS non si attiva | Verifica DNS non completata | Aspetta 24h, poi togli e rimetti il dominio in Settings → Pages |

---

## Stack tecnologico

- **Frontend**: HTML5 + CSS3 + Vanilla JS (ES2020), zero framework, zero build step
- **Tipografia**: [Cormorant Garamond](https://fonts.google.com/specimen/Cormorant+Garamond) (display) + [DM Sans](https://fonts.google.com/specimen/DM+Sans) (body)
- **Backend**: [Supabase](https://supabase.com) (PostgreSQL + REST API + RLS) — free tier
- **Hosting**: GitHub Pages — gratuito, HTTPS automatico via Let's Encrypt
- **CI/CD**: GitHub Actions
- **DNS**: register.it (apex A records → GitHub Pages anycast)
- **Performance target**: LCP < 2.5s, INP < 200ms, CLS < 0.1

---

## Licenza

Codice MIT — fai quello che vuoi, ma il nome **GESTISCIME**, il logo e l'identità di brand sono riservati.

---

Made with care in Italia 🇮🇹
