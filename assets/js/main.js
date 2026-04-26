/* ============================================
   GESTISCIME — main.js
   - Waitlist form submission to Supabase
   - Honeypot anti-bot
   - Scroll reveal animations
   - Footer year
   - Smooth-scroll anchor handling
============================================ */

(function () {
  "use strict";

  /* -------------------------------------------
     Footer year
  ------------------------------------------- */
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* -------------------------------------------
     Reveal-on-scroll (uses data-delay for stagger)
  ------------------------------------------- */
  const reveals = document.querySelectorAll(".reveal");
  reveals.forEach((el) => {
    const delay = el.getAttribute("data-delay");
    if (delay) el.style.setProperty("--reveal-delay", delay);
  });

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    // Fallback: just show everything
    reveals.forEach((el) => el.classList.add("is-visible"));
  }

  /* -------------------------------------------
     Email validation (RFC 5322 simplified)
  ------------------------------------------- */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function isValidEmail(value) {
    return typeof value === "string" && EMAIL_RE.test(value.trim());
  }

  /* -------------------------------------------
     Local de-dupe (UX nicety; the database is
     the source of truth via the UNIQUE constraint)
  ------------------------------------------- */
  const SUBMITTED_KEY = "gestiscime:submitted";

  function alreadySubmitted(email) {
    try {
      const list = JSON.parse(localStorage.getItem(SUBMITTED_KEY) || "[]");
      return list.indexOf(email.toLowerCase()) !== -1;
    } catch (e) {
      return false;
    }
  }

  function markSubmitted(email) {
    try {
      const list = JSON.parse(localStorage.getItem(SUBMITTED_KEY) || "[]");
      list.push(email.toLowerCase());
      localStorage.setItem(SUBMITTED_KEY, JSON.stringify(list.slice(-20)));
    } catch (e) {
      /* ignore */
    }
  }

  /* -------------------------------------------
     Submit to Supabase REST API
     POSTs the email + metadata to the waitlist table.
     RLS policies allow anonymous INSERT but block
     SELECT, so nobody can read the list from here.
  ------------------------------------------- */
  async function submitToSupabase(email) {
    const cfg = window.GESTISCIME_CONFIG || {};

    if (
      !cfg.SUPABASE_URL ||
      cfg.SUPABASE_URL.indexOf("YOUR-PROJECT-REF") !== -1 ||
      !cfg.SUPABASE_ANON_KEY ||
      cfg.SUPABASE_ANON_KEY.indexOf("YOUR-PUBLIC") !== -1
    ) {
      throw new Error(
        "Configurazione Supabase mancante. Modifica /assets/js/config.js."
      );
    }

    const endpoint =
      cfg.SUPABASE_URL.replace(/\/$/, "") +
      "/rest/v1/" +
      encodeURIComponent(cfg.WAITLIST_TABLE || "waitlist");

    const payload = {
      email: email.toLowerCase().trim(),
      source: cfg.SOURCE || "homepage",
      // user_agent and referrer help you spot bots later if needed.
      // No IP, no fingerprint — GDPR-friendly.
      user_agent: (navigator.userAgent || "").slice(0, 250),
      referrer: (document.referrer || "").slice(0, 500),
      locale: (navigator.language || "it-IT").slice(0, 10),
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.SUPABASE_ANON_KEY,
        Authorization: "Bearer " + cfg.SUPABASE_ANON_KEY,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) return { ok: true };

    // Handle Supabase's UNIQUE-violation gracefully (code 23505)
    let body = {};
    try {
      body = await response.json();
    } catch (e) {
      /* not json */
    }
    if (body && (body.code === "23505" || /duplicate/i.test(body.message || ""))) {
      return { ok: true, duplicate: true };
    }

    const reason =
      (body && (body.message || body.hint || body.error_description)) ||
      "Errore " + response.status;
    throw new Error(reason);
  }

  /* -------------------------------------------
     Wire up forms
  ------------------------------------------- */
  function wireForm(form) {
    if (!form) return;

    const input = form.querySelector('input[type="email"]');
    const honeypot = form.querySelector('input[name="website"]');
    const button = form.querySelector('button[type="submit"]');
    const status = form.querySelector(".form-status");

    if (!input || !button) return;

    function setStatus(text, type) {
      if (!status) return;
      status.textContent = text || "";
      status.classList.remove("is-error", "is-success");
      if (type === "error") status.classList.add("is-error");
      if (type === "success") status.classList.add("is-success");
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      setStatus("", null);

      const email = (input.value || "").trim();

      // Honeypot: if a bot fills the hidden field, fake a success silently
      if (honeypot && honeypot.value) {
        setStatus("Grazie! Ti scriveremo presto.", "success");
        form.reset();
        return;
      }

      if (!isValidEmail(email)) {
        setStatus("Inserisci un'email valida.", "error");
        input.focus();
        return;
      }

      if (alreadySubmitted(email)) {
        setStatus(
          "Sei già nella lista — controlla la posta (anche lo spam).",
          "success"
        );
        form.reset();
        return;
      }

      const originalLabel = button.querySelector(".btn-label");
      const labelBefore = originalLabel ? originalLabel.textContent : "";

      button.disabled = true;
      if (originalLabel) originalLabel.textContent = "Invio…";

      try {
        const res = await submitToSupabase(email);
        markSubmitted(email);

        if (res.duplicate) {
          setStatus(
            "Questa email è già nella lista — grazie per la pazienza!",
            "success"
          );
        } else {
          setStatus(
            "Sei dentro. Ti scriveremo prima del lancio.",
            "success"
          );
        }
        form.reset();
      } catch (err) {
        console.error("[GESTISCIME] Submit failed:", err);
        setStatus(
          "Qualcosa non ha funzionato. Riprova tra poco.",
          "error"
        );
      } finally {
        button.disabled = false;
        if (originalLabel) originalLabel.textContent = labelBefore;
      }
    });
  }

  document
    .querySelectorAll(".waitlist-form")
    .forEach((form) => wireForm(form));

  /* -------------------------------------------
     Cookie Consent Management (GDPR)
     - Shows banner on first visit
     - Locks forms until a choice is made
     - Persists choice in localStorage
  ------------------------------------------- */
  const COOKIE_KEY = "gestiscime:cookie-consent";

  function getCookieConsent() {
    try { return localStorage.getItem(COOKIE_KEY); } catch(e) { return null; }
  }

  function setCookieConsent(value) {
    try { localStorage.setItem(COOKIE_KEY, value); } catch(e) { /* ignore */ }
  }

  function lockForms() {
    document.querySelectorAll(".waitlist-form").forEach((f) => {
      f.classList.add("consent-required");
      f.querySelectorAll("input, button").forEach((el) => el.setAttribute("disabled", ""));
    });
  }

  function unlockForms() {
    document.querySelectorAll(".waitlist-form").forEach((f) => {
      f.classList.remove("consent-required");
      f.querySelectorAll("input, button").forEach((el) => el.removeAttribute("disabled"));
    });
  }

  function hideBanner() {
    const banner = document.getElementById("cookie-banner");
    if (banner) {
      banner.style.transition = "opacity 0.3s ease, transform 0.3s ease";
      banner.style.opacity = "0";
      banner.style.transform = "translateY(20px)";
      setTimeout(() => banner.classList.add("is-hidden"), 320);
    }
  }

  function initCookieBanner() {
    const consent = getCookieConsent();

    // Already made a choice → just apply and skip banner
    if (consent === "accepted" || consent === "rejected") {
      unlockForms();
      return;
    }

    // No choice yet → lock forms and show banner
    lockForms();

    const banner = document.getElementById("cookie-banner");
    const btnAccept = document.getElementById("cookie-accept");
    const btnReject = document.getElementById("cookie-reject");

    if (!banner || !btnAccept || !btnReject) return;

    btnAccept.addEventListener("click", () => {
      setCookieConsent("accepted");
      unlockForms();
      hideBanner();
    });

    btnReject.addEventListener("click", () => {
      // "Solo tecnici" = consent to functional-only; forms still work
      setCookieConsent("rejected");
      unlockForms();
      hideBanner();
    });

    // Clicking the locked form overlay scrolls to banner
    document.querySelectorAll(".waitlist-form.consent-required").forEach((f) => {
      f.addEventListener("click", () => {
        banner.scrollIntoView({ behavior: "smooth", block: "end" });
        btnAccept.focus();
      });
    });
  }

  initCookieBanner();

  /* -------------------------------------------
     Smooth-scroll for in-page anchors with offset
     to compensate for the sticky header
  ------------------------------------------- */
  const headerEl = document.querySelector(".site-header");
  const headerOffset = () => (headerEl ? headerEl.offsetHeight + 16 : 0);

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", (e) => {
      const id = anchor.getAttribute("href");
      if (!id || id === "#") return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      const top =
        target.getBoundingClientRect().top + window.pageYOffset - headerOffset();
      window.scrollTo({ top, behavior: "smooth" });
      // Update URL without jumping
      history.replaceState(null, "", id);
    });
  });
})();
