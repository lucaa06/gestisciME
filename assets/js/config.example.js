/**
 * GESTISCIME — Configurazione client
 * --------------------------------------
 * Questo è un file di ESEMPIO. Il file reale (assets/js/config.js)
 * viene generato automaticamente durante il deploy da GitHub Actions,
 * usando i Secrets configurati nel repository.
 *
 * Per lo sviluppo locale:
 *   1. Copia questo file in  assets/js/config.js
 *   2. Sostituisci i valori con quelli del tuo progetto Supabase
 *      (Settings → API nella dashboard Supabase)
 *   3. config.js è nel .gitignore, quindi non verrà mai committato.
 *
 * IMPORTANTE: la SUPABASE_ANON_KEY è una chiave PUBBLICA, è normale
 * che finisca nel browser. La sicurezza del database è garantita
 * dalle Row Level Security policies definite in /supabase/schema.sql.
 *
 * NON usare MAI la "service_role key" qui: quella va tenuta
 * solo lato server / nelle GitHub Secrets.
 */
window.GESTISCIME_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-PUBLIC-ANON-KEY",

  // Tabella su cui inserire le email. Lascia "waitlist" se hai usato lo schema fornito.
  WAITLIST_TABLE: "waitlist",

  // Origine del traffico: utile se vuoi distinguere le iscrizioni
  // (es. "homepage", "campaign-fb", ecc.). Lascia "homepage" se non serve.
  SOURCE: "homepage",
};
