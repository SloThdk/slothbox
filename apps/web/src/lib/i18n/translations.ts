/**
 * SlothBox translations — Danish + English in a single typed registry.
 *
 * Structure mirrors the philipsloth-portfolio + slothcv translation files
 * so a developer (or a future LLM) moving between Philip's three sites
 * sees the same shape and the same key naming style. Keys are
 * dot-namespaced by surface (nav.*, hero.*, footer.*, etc.).
 *
 * Why a hand-curated bilingual map rather than ICU / next-intl:
 *   - This site is two languages and ~120 strings — full ICU pulls a
 *     ~30 KB runtime plus a build-time message extractor for negligible
 *     gain at this scale.
 *   - The map shape gives TypeScript a literal-union of valid keys, so
 *     a typo in t("hero.headlinee") is a compile error, not a silent
 *     fallback to the key string at runtime.
 *   - Translators only need to read this one file — no JSON imports,
 *     no extraction tooling, no plural-form rules to learn.
 *
 * Translation discipline (Danish):
 *   - Real æ ø å, never ae / oe / aa.
 *   - "You" → "du" (informal) for the marketing surface; the tone here
 *     is friendly, not corporate-formal.
 *   - Tech terms that don't have a clean Danish equivalent (libsodium,
 *     XChaCha20-Poly1305, RFC 3161) stay in English.
 *   - Sentence-case headlines, not title-case (matches Danish typography
 *     convention and the visionOS-light visual register).
 */

/** Two supported languages for now. Add another locale by extending this
 *  literal union and filling in every entry below. */
export type Lang = "en" | "da";

/** Every translation entry must define BOTH languages so a missing
 *  language at runtime is impossible to reach. Optional fields here
 *  would let the registry desync silently. */
export interface TranslationEntry {
  en: string;
  da: string;
}

/**
 * Master translation table. The keys form a literal-union of valid
 * `t()` arguments — adding a key here makes it instantly callable; using
 * an undeclared key is a TypeScript error.
 */
export const TRANSLATIONS = {
  // ─── Language toggle UI ────────────────────────────────────────
  "lang.toggleAria": {
    en: "Switch language",
    da: "Skift sprog",
  },
  "lang.english": {
    en: "English",
    da: "Engelsk",
  },
  "lang.danish": {
    en: "Danish",
    da: "Dansk",
  },

  // ─── Header / nav ─────────────────────────────────────────────
  "nav.home": {
    en: "Home",
    da: "Forside",
  },
  "nav.about": {
    en: "About",
    da: "Om",
  },
  "nav.security": {
    en: "Security",
    da: "Sikkerhed",
  },
  "nav.homeAria": {
    en: "SlothBox — home",
    da: "SlothBox — forside",
  },

  // ─── Footer ───────────────────────────────────────────────────
  "footer.tagline": {
    en: "End-to-end encrypted file transfer. Open source under the MIT licence. Hosted in the EU — German data centre, no US transit.",
    da: "End-to-end krypteret filoverførsel. Open source under MIT-licensen. Hostet i EU — tysk datacenter, ingen transit gennem USA.",
  },
  "footer.col.product": {
    en: "Product",
    da: "Produkt",
  },
  "footer.col.legal": {
    en: "Legal",
    da: "Juridisk",
  },
  "footer.link.send": {
    en: "Send a file",
    da: "Send en fil",
  },
  "footer.link.about": {
    en: "About",
    da: "Om",
  },
  "footer.link.security": {
    en: "Security",
    da: "Sikkerhed",
  },
  "footer.builtBy": {
    en: "Built by",
    da: "Bygget af",
  },
  "footer.madeIn": {
    en: "Made in Denmark.",
    da: "Lavet i Danmark.",
  },
  "footer.residency": {
    en: "EU residency: data lives in a German data centre. No US transit.",
    da: "EU-residens: data ligger i et tysk datacenter. Ingen transit gennem USA.",
  },

  // ─── Landing — hero ───────────────────────────────────────────
  "hero.statusPill": {
    en: "v0.1.0-alpha · public source",
    da: "v0.1.0-alpha · offentlig kildekode",
  },
  "alphaBanner.title": {
    en: "v0.1 alpha — read this before sending real data.",
    da: "v0.1 alpha — læs dette før du sender rigtige data.",
  },
  "alphaBanner.body": {
    en: "Anyone holding the share URL can destroy or burn the share — the v0.1 access model treats the shortId as the access secret. Tamper-evident RFC 3161 receipts arrive in v0.5; per-recipient asymmetric encryption arrives in v1.0. Use this build for portfolio review and personal experimentation, not for sensitive transfers.",
    da: "Alle, der har delingens URL, kan destruere eller brænde delingen — v0.1's adgangsmodel behandler shortId som adgangshemmeligheden. Manipulationsbeskyttede RFC 3161-kvitteringer kommer i v0.5, og per-modtager asymmetrisk kryptering kommer i v1.0. Brug denne version til portfolio-gennemgang og personlig test, ikke til følsomme overførsler.",
  },
  "alphaBanner.dismiss": {
    en: "I understand",
    da: "Jeg forstår",
  },
  "alphaBanner.readMore": {
    en: "Read the full security policy",
    da: "Læs hele sikkerhedspolitikken",
  },

  // ─── Footer abuse + takedown link ─────────────────────────────
  "footer.link.abuse": {
    en: "Report abuse",
    da: "Rapportér misbrug",
  },

  // ─── /abuse page ──────────────────────────────────────────────
  "abuse.eyebrow": {
    en: "Trust & safety",
    da: "Tillid & sikkerhed",
  },
  "abuse.heading": {
    en: "Report illegal content or abuse.",
    da: "Rapportér ulovligt indhold eller misbrug.",
  },
  "abuse.lede": {
    en: "If you have received a SlothBox share link that contains illegal content (CSAM, terrorist content, IP-infringing material, fraud, malware, anything else covered by EU or Danish law) or are otherwise being harmed by abuse of this service, please report it. The operator can destroy the share without ever decrypting its contents — the destroy operation invalidates the encryption key reference in the audit chain, which renders the ciphertext mathematically unrecoverable.",
    da: "Hvis du har modtaget et SlothBox-delingslink, der indeholder ulovligt indhold (CSAM, terror-indhold, krænkelser af immaterielle rettigheder, svindel, malware eller andet omfattet af EU- eller dansk lovgivning), eller du på anden måde er ramt af misbrug af denne tjeneste, så rapportér det. Operatøren kan destruere delingen uden at dekryptere indholdet — destroy-operationen invaliderer nøglereferencen i audit-kæden, hvilket gør ciphertexten matematisk uigenoprettelig.",
  },
  "abuse.howTo.heading": {
    en: "How to report",
    da: "Sådan rapporterer du",
  },
  "abuse.howTo.body": {
    en: "Email the contact below with the share's shortId (the 12-character path segment after `/s/` in the URL — NOT the part after `#`, which is the decryption key and must never leave your browser). Include a description of the abuse and your contact details if you want a response. Reports are reviewed within 24 hours; high-severity reports (CSAM, immediate-harm content) are prioritised same-day.",
    da: "Skriv til kontakten herunder med delingens shortId (de 12 tegn i URL'en efter `/s/` — IKKE delen efter `#`, som er dekrypteringsnøglen og aldrig må forlade din browser). Inkludér en beskrivelse af misbruget og dine kontaktoplysninger, hvis du ønsker svar. Rapporter gennemgås inden for 24 timer; rapporter med høj alvor (CSAM, indhold med umiddelbar skade) prioriteres samme dag.",
  },
  "abuse.contact.heading": {
    en: "Contact",
    da: "Kontakt",
  },
  "abuse.contact.body": {
    en: "Email reports directly to",
    da: "Send rapporter direkte til",
  },
  "abuse.contact.or": {
    en: "or use the contact form at",
    da: "eller brug kontaktformularen på",
  },
  "abuse.contact.body.tail": {
    en: "Both routes reach the same inbox. PGP and Signal contact options are listed in the security policy.",
    da: "Begge veje rammer samme indbakke. PGP- og Signal-kontaktmuligheder er angivet i sikkerhedspolitikken.",
  },
  "abuse.dontInclude.heading": {
    en: "Do NOT include",
    da: "Inkludér IKKE",
  },
  "abuse.dontInclude.body": {
    en: "Do NOT paste the full share URL including the part after `#`. That fragment is the decryption key. Sending it would let the operator decrypt the content, which defeats the end-to-end encryption guarantee. The shortId alone is enough to destroy the share.",
    da: "Indsæt IKKE hele delings-URL'en inklusive delen efter `#`. Det fragment er dekrypteringsnøglen. Hvis du sender den, kan operatøren dekryptere indholdet, hvilket bryder end-to-end-kryptering. Kun shortId'et er nødvendigt for at destruere delingen.",
  },
  "abuse.legal.heading": {
    en: "Legal basis",
    da: "Retsgrundlag",
  },
  "abuse.legal.body": {
    en: "This page is the SlothBox notice mechanism under the EU Digital Services Act (Regulation 2022/2065, Article 16). Reports are processed under Danish law; the operator is established in Denmark. The operator does not have access to the plaintext content of any share, so abuse triage relies on the reporting party's description plus the metadata associated with the shortId (creation timestamp, expiry, sender IP-fragment hash, chunk count, total ciphertext size).",
    da: "Denne side er SlothBox' notice-mekanisme under EU's Digital Services Act (forordning 2022/2065, artikel 16). Rapporter behandles efter dansk ret; operatøren er etableret i Danmark. Operatøren har ikke adgang til klarteksten af nogen deling, så vurdering af misbrug bygger på rapportørens beskrivelse plus metadata tilknyttet shortId'et (oprettelses-tidsstempel, udløb, hash-fragment af afsenderens IP, antal bidder, samlet ciphertext-størrelse).",
  },
  "hero.headline.l1": {
    en: "Send any file.",
    da: "Send hvilken som helst fil.",
  },
  "hero.headline.l2": {
    en: "The server can't read it.",
    da: "Serveren kan ikke læse den.",
  },
  "hero.headline.l3": {
    en: "Read the source.",
    da: "Læs kildekoden.",
  },
  "hero.copy.before": {
    en: "SlothBox seals your file in your browser before it leaves your machine. The unlock key lives in the part of the URL after",
    da: "SlothBox forsegler din fil i din browser, før den forlader maskinen. Oplåsningsnøglen lever i den del af URL'en, der står efter",
  },
  "hero.copy.after": {
    en: "— which browsers never send to any server. Audited libsodium primitives only. No telemetry. No accounts.",
    da: "— som browsere aldrig sender til nogen server. Kun auditerede libsodium-primitiver. Ingen telemetri. Ingen konto.",
  },
  "hero.cta.primary": {
    en: "How the trust model works",
    da: "Sådan virker tillidsmodellen",
  },
  "hero.cta.secondary": {
    en: "How SlothBox works",
    da: "Sådan virker SlothBox",
  },

  // ─── Landing — guarantees section ─────────────────────────────
  "guarantees.eyebrow": {
    en: "Trust comes from architecture",
    da: "Tilliden kommer fra arkitekturen",
  },
  "guarantees.heading": {
    en: "Four guarantees, each enforced at the code or infrastructure layer.",
    da: "Fire garantier, hver håndhævet i kode eller infrastruktur — ikke i marketing.",
  },
  "guarantees.item1.title": {
    en: "We can't decrypt your files",
    da: "Vi kan ikke dekryptere dine filer",
  },
  "guarantees.item1.body": {
    en: "XChaCha20-Poly1305 in your browser, before any byte leaves your device. The key lives in the URL fragment — browsers never send it to any server.",
    da: "XChaCha20-Poly1305 i din browser, før en eneste byte forlader enheden. Nøglen ligger i URL-fragmentet — browsere sender det aldrig til nogen server.",
  },
  "guarantees.item2.title": {
    en: "EU only. No US transit.",
    da: "Kun EU. Ingen transit gennem USA.",
  },
  "guarantees.item2.body": {
    en: "EU-jurisdiction servers, German data centre. No CloudFront. No Vercel edge. Schrems II is not a concern because no part of the data path crosses US jurisdiction.",
    da: "Servere under EU-jurisdiktion, tysk datacenter. Ingen CloudFront. Ingen Vercel edge. Schrems II er irrelevant, fordi ingen del af datapathen krydser amerikansk jurisdiktion.",
  },
  "guarantees.item3.title": {
    en: "Open source, every line.",
    da: "Open source — hver eneste linje.",
  },
  "guarantees.item3.body": {
    en: "This repository is the entire production stack. `docker compose up -d` brings the whole thing online on your own machine. Every claim is auditable.",
    da: "Dette repository er hele produktions-stakken. `docker compose up -d` rejser det hele på din egen maskine. Hver påstand kan auditeres.",
  },
  "guarantees.item4.title": {
    en: "Verifiable, not just promised.",
    da: "Verificerbart — ikke bare lovet.",
  },
  "guarantees.item4.body": {
    en: "v0.5 ships RFC 3161 timestamped delivery receipts. v1.0 adds verifiable burn-after-read via a public hash chain and an offline `slothbox-verify` CLI.",
    da: "v0.5 leverer RFC 3161-tidsstemplede leveringskvitteringer. v1.0 tilføjer verificerbar burn-after-read via en offentlig hash-kæde og en offline `slothbox-verify`-CLI.",
  },

  // ─── Landing — how it works ───────────────────────────────────
  "how.eyebrow": {
    en: "How it works",
    da: "Sådan virker det",
  },
  "how.heading": {
    en: "Three steps. No secrets shared with us.",
    da: "Tre trin. Ingen hemmeligheder deles med os.",
  },
  "how.step.label": {
    en: "step",
    da: "trin",
  },
  "how.step1.title": {
    en: "Drop a file",
    da: "Slip en fil",
  },
  "how.step1.body": {
    en: "Pick or drag a file. Up to 4 GiB per share in this alpha. Nothing has left your machine yet.",
    da: "Vælg eller træk en fil. Op til 4 GiB pr. deling i denne alpha. Intet har forladt din maskine endnu.",
  },
  "how.step2.title": {
    en: "Encrypted locally",
    da: "Krypteret lokalt",
  },
  "how.step2.body": {
    en: "Your browser generates a 256-bit key, slices the file into 5 MiB chunks, and seals each chunk with XChaCha20-Poly1305.",
    da: "Din browser genererer en 256-bit nøgle, deler filen i 5 MiB-bidder og forsegler hver bid med XChaCha20-Poly1305.",
  },
  "how.step3.title": {
    en: "Share the link",
    da: "Del linket",
  },
  "how.step3.body": {
    en: "Send the share link over any channel you trust. The decryption key rides in the URL fragment — your recipient's browser unlocks the file on their side.",
    da: "Send delingslinket gennem en kanal, du stoler på. Dekrypteringsnøglen ligger i URL-fragmentet — modtagerens browser låser filen op på deres side.",
  },

  // ─── Landing — closing CTA ────────────────────────────────────
  "ctaBlock.eyebrow": {
    en: "Built to be inspected",
    da: "Bygget til at blive inspiceret",
  },
  "ctaBlock.heading": {
    en: "Send a file. Prove it arrived.",
    da: "Send en fil. Bevis at den ankom.",
  },
  "ctaBlock.body": {
    en: "Tamper-evident delivery receipts arrive in v0.5: an RFC 3161 timestamp signed over the file hash, anchored in a public Merkle chain. The full source is open — read it before trusting it.",
    da: "Manipulationsbeskyttede leveringskvitteringer kommer i v0.5: en RFC 3161-tidsstempel signeret over filens hash, forankret i en offentlig Merkle-kæde. Hele kildekoden er åben — læs den før du stoler på den.",
  },
  "ctaBlock.cta": {
    en: "Read the security docs",
    da: "Læs sikkerhedsdokumentationen",
  },

  // ─── About page ───────────────────────────────────────────────
  "about.eyebrow": {
    en: "About",
    da: "Om",
  },
  "about.heading": {
    en: "What SlothBox is, and why it exists.",
    da: "Hvad SlothBox er — og hvorfor den findes.",
  },
  "about.intro": {
    en: "SlothBox is an EU-hosted, end-to-end encrypted file transfer service. Drop a file, get a link, send the link, your recipient downloads. The bit that's different: the server cannot decrypt anything you upload — the architecture itself prevents it, not a marketing promise.",
    da: "SlothBox er en EU-hostet, end-to-end krypteret filoverførselstjeneste. Slip en fil, få et link, send linket, modtageren downloader. Det særlige: serveren kan ikke dekryptere noget af det, du uploader — det er arkitekturen selv, der forhindrer det, ikke et marketing-løfte.",
  },
  "about.intro.under": {
    en: "",
    da: "",
  },
  "about.why.heading": {
    en: "Why this, and why now",
    da: "Hvorfor — og hvorfor nu",
  },
  "about.why.body": {
    en: "WeTransfer scans your file and keeps a copy. Dropbox Transfer reads your content and runs through US infrastructure (Schrems II problem for EU users). ProtonDrive is end-to-end encrypted but paid, account-only, and has no quick-share for unauthenticated recipients. There is no good European, open-source, end-to-end encrypted file transfer with cryptographic delivery receipts. SlothBox aims at that gap.",
    da: "WeTransfer scanner din fil og beholder en kopi. Dropbox Transfer læser dit indhold og kører gennem amerikansk infrastruktur (Schrems II-problem for EU-brugere). ProtonDrive er end-to-end krypteret, men betalt, kontobaseret og uden quick-share til uautentificerede modtagere. Der findes ingen god europæisk, open source, end-to-end krypteret filoverførsel med kryptografiske leveringskvitteringer. SlothBox sigter mod det hul.",
  },
  "about.who.heading": {
    en: "Who built it",
    da: "Hvem har bygget det",
  },
  "about.who.body.lead": {
    en: "Hi — I'm",
    da: "Hej — jeg er",
  },
  "about.who.body.rest": {
    en: ", a sole-proprietor developer based in Denmark. I build software where the security guarantees come from the architecture rather than a marketing page. SlothBox is one of two open-source reference builds I run alongside client work — the other is",
    da: ", enkeltmandsudvikler i Danmark. Jeg bygger software, hvor sikkerhedsgarantierne kommer fra arkitekturen i stedet for en marketingside. SlothBox er en af to open-source referencebygninger, jeg kører ved siden af kundeprojekter — den anden er",
  },
  "about.who.body.tail": {
    en: ", a free CV builder with similar trust-as-architecture discipline.",
    da: ", en gratis CV-bygger med samme tillid-via-arkitektur-disciplin.",
  },
  "about.status.heading": {
    en: "Status",
    da: "Status",
  },
  "about.status.body": {
    en: "v0.1.0-alpha is a portfolio reference build. The cryptographic primitives (libsodium, age) are battle-tested, but the SlothBox integration has not yet been independently audited. Don't use this for high-stakes secrets until v1.0 + external cryptographer review.",
    da: "v0.1.0-alpha er en portfolio-referencebygning. De kryptografiske primitiver (libsodium, age) er gennemtestede, men SlothBox-integrationen er endnu ikke uafhængigt auditeret. Brug ikke dette til kritiske hemmeligheder før v1.0 + ekstern kryptografgennemgang.",
  },
  "about.status.body.tail": {
    en: "",
    da: "",
  },
  "about.name.heading": {
    en: "Why “sloth”",
    da: "Hvorfor “sloth”",
  },
  "about.name.body": {
    en: "Slow on purpose. Encryption that's rushed is encryption that breaks. Every primitive in this stack is audited, every default is conservative, and every shortcut is documented as such. The brand is a reminder: trust earns itself slowly.",
    da: "Langsom med vilje. Kryptering, der bliver forhastet, er kryptering, der knækker. Hver primitiv i denne stak er auditeret, hver default er konservativ, og hver genvej er dokumenteret som sådan. Brandet er en påmindelse: tillid optjenes langsomt.",
  },
  "about.host.body.lead": {
    en: "Built on a single ARM Linux VM in an EU jurisdiction, with eight other people's open-source projects holding it up. See",
    da: "Bygget på en enkelt ARM Linux-VM i EU-jurisdiktion, holdt oppe af otte andre menneskers open source-projekter. Se",
  },
  "about.host.body.tail": {
    en: "for the threat model.",
    da: "for trusselsmodellen.",
  },

  // ─── Security page ────────────────────────────────────────────
  "security.eyebrow": {
    en: "Security",
    da: "Sikkerhed",
  },
  "security.heading": {
    en: "We don't ask you to trust us.",
    da: "Vi beder dig ikke om at stole på os.",
  },
  "security.lede": {
    en: "Below is a summary of how SlothBox enforces its trust guarantees. The canonical documents — threat model, full crypto details, runbook — live in the repository so they version with the code.",
    da: "Herunder er en sammenfatning af, hvordan SlothBox håndhæver sine tillidsgarantier. De kanoniske dokumenter — trusselsmodel, fulde krypteringsdetaljer, runbook — ligger i repositoryet, så de versioneres med koden.",
  },
  "security.crypto.title": {
    en: "Cryptography",
    da: "Kryptografi",
  },
  "security.crypto.body": {
    en: "XChaCha20-Poly1305 IETF for symmetric AEAD. BLAKE2b-256 for key fingerprints. Argon2id for password-protected shares (v0.5+). All primitives are direct calls into libsodium — no custom logic, no hand-rolled MAC, no key stretching outside vetted defaults.",
    da: "XChaCha20-Poly1305 IETF til symmetrisk AEAD. BLAKE2b-256 til nøglefingeraftryk. Argon2id til adgangskode-beskyttede delinger (v0.5+). Alle primitiver er direkte kald til libsodium — ingen specialbygget logik, ingen håndrullet MAC, ingen nøglestrækning ud over auditerede defaults.",
  },
  "security.threat.title": {
    en: "Threat model",
    da: "Trusselsmodel",
  },
  "security.threat.body": {
    en: "The system protects content confidentiality from the SlothBox operator and from network observers. It does not protect against an endpoint compromise (sender or recipient). Explicit non-goals are documented so you can decide whether the model fits your use case.",
    da: "Systemet beskytter indholdets fortrolighed mod SlothBox-operatøren og mod netværksaflyttere. Det beskytter ikke mod et kompromitteret endpoint (afsender eller modtager). De eksplicitte ikke-mål er dokumenteret, så du kan vurdere, om modellen passer til dit formål.",
  },
  "security.architecture.title": {
    en: "Verifiable architecture",
    da: "Verificerbar arkitektur",
  },
  "security.architecture.body": {
    en: "Every container, every config, every cryptographic call lives in one repo under MIT. `docker compose up -d` brings the entire production stack online on your machine. v1.0 ships an offline `slothbox-verify` CLI you can audit independently.",
    da: "Hver container, hver konfiguration, hvert kryptografisk kald ligger i ét repository under MIT. `docker compose up -d` rejser hele produktions-stakken på din maskine. v1.0 leverer en offline `slothbox-verify`-CLI, du selv kan auditere.",
  },
  "security.audit.title": {
    en: "Audit roadmap",
    da: "Audit-roadmap",
  },
  "security.audit.body": {
    en: "v0.1.0-alpha — internal review only. v1.0 — independent cryptographer review + third-party application pen test, with reports published under /audits/. We will not soften this milestone to ship faster.",
    da: "v0.1.0-alpha — kun intern gennemgang. v1.0 — uafhængig kryptografgennemgang + tredjeparts pen-test af applikationen, med rapporter publiceret under /audits/. Denne milepæl bliver ikke blødt op for at sende hurtigere.",
  },
  "security.disclose.heading": {
    en: "Reporting a vulnerability",
    da: "Rapportering af sårbarheder",
  },
  "security.disclose.body.lead": {
    en: "Send vulnerability reports privately to the maintainer at",
    da: "Send sårbarhedsrapporter privat til vedligeholderen på",
  },
  "security.disclose.body.or": {
    en: "or use the contact form at",
    da: "eller brug kontaktformularen på",
  },
  "security.disclose.body.tail": {
    en: ". v0.1 has no bug bounty; v1.0 will, scope-limited.",
    da: ". v0.1 har ingen bug bounty; v1.0 får én, scopebegrænset.",
  },

  // ─── UploadDrop ───────────────────────────────────────────────
  "upload.dropPrompt": {
    en: "Drop a file, or click to choose",
    da: "Slip en fil — eller klik for at vælge",
  },
  "upload.maxNote": {
    en: "Up to {max} · sealed in your browser before upload",
    da: "Op til {max} · forseglet i din browser før upload",
  },
  "upload.expires": {
    en: "Expires after",
    da: "Udløber efter",
  },
  "upload.expires.help": {
    en: "When this timer runs out, the share link stops working and the encrypted blob is deleted from the server. Pick the shortest window that still gives the recipient time to download.",
    da: "Når timeren løber ud, stopper delingslinket med at virke, og den krypterede fil bliver slettet fra serveren. Vælg det korteste vindue, der stadig giver modtageren tid til at downloade.",
  },
  "upload.expiry.placeholder": {
    en: "Select expiry",
    da: "Vælg udløb",
  },
  "upload.expiry.1h": {
    en: "1 hour",
    da: "1 time",
  },
  "upload.expiry.24h": {
    en: "24 hours",
    da: "24 timer",
  },
  "upload.expiry.7d": {
    en: "7 days",
    da: "7 dage",
  },
  "upload.expiry.30d": {
    en: "30 days",
    da: "30 dage",
  },
  "upload.burn": {
    en: "Burn after read",
    da: "Brænd efter læsning",
  },
  "upload.burn.help": {
    en: "The share is destroyed the moment your recipient finishes downloading. Use this for one-shot transfers where you don't want a second download to be possible.",
    da: "Delingen destrueres i samme øjeblik modtageren har downloadet filen. Brug det til engangs-overførsler, hvor en anden download ikke skal være mulig.",
  },
  "upload.trust": {
    en: "Encryption happens in your browser. The key never leaves this tab.",
    da: "Krypteringen sker i din browser. Nøglen forlader aldrig denne fane.",
  },
  "upload.cancel": {
    en: "Cancel upload",
    da: "Annullér upload",
  },
  "upload.toast.success": {
    en: "Encrypted and uploaded.",
    da: "Krypteret og uploadet.",
  },
  "upload.toast.empty": {
    en: "file is empty",
    da: "filen er tom",
  },
  "upload.toast.tooLarge": {
    en: "file is too large (max {max})",
    da: "filen er for stor (maks. {max})",
  },
  "upload.preparing": {
    en: "{size} · preparing…",
    da: "{size} · forbereder…",
  },
  "upload.chunkProgress": {
    en: "Chunk {done}/{total} · {bytesDone} / {bytesTotal}",
    da: "Bid {done}/{total} · {bytesDone} / {bytesTotal}",
  },
  "upload.percentLabel": {
    en: "{percent}% encrypted + uploaded",
    da: "{percent}% krypteret + uploadet",
  },
  "upload.encrypting": {
    en: "encrypting…",
    da: "krypterer…",
  },
  "upload.engineLabel": {
    en: "XChaCha20-Poly1305 · 5 MiB chunks",
    da: "XChaCha20-Poly1305 · 5 MiB-bidder",
  },
} as const satisfies Record<string, TranslationEntry>;

/** Literal-union of every key in TRANSLATIONS. The `t()` function uses
 *  this so an unknown key is a compile error, never a runtime fallback. */
export type TranslationKey = keyof typeof TRANSLATIONS;
