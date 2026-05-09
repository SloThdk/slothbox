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

  // ─── About — when to reach for it (deeper than homepage) ───────
  "about.useCases.heading": {
    en: "When this is the right tool",
    da: "Hvornår det er det rigtige værktøj",
  },
  "about.useCases.body": {
    en: "If the file is sensitive enough that you don't want WeTransfer keeping a copy on US infrastructure for seven days — but you also don't want to onboard the recipient onto a paid Proton account just to receive one document — SlothBox sits between the two extremes. Encrypted in your browser, EU-only data path, no recipient signup, gone after delivery.",
    da: "Hvis filen er følsom nok til, at du ikke vil have WeTransfer liggende på amerikansk infrastruktur i syv dage — men du heller ikke har lyst til at få modtageren til at oprette en betalt Proton-konto bare for at modtage ét dokument — så ligger SlothBox imellem de to yderpunkter. Krypteret i din browser, kun-EU-datapath, ingen modtagertilmelding, væk efter levering.",
  },
  "about.useCases.body.notRight": {
    en: "If you're sharing a holiday-photo album with family, or a marketing-deck draft with the whole team, or anything where the recipients want a permanent shareable link they can come back to next month — SlothBox is the wrong tool. Use Dropbox, Google Drive, or whatever your workflow is built on. The encryption discipline here costs you the convenience of a permanent URL, and that trade only pays off when the file is actually sensitive.",
    da: "Hvis du deler et ferie-foto-album med familien, et marketing-deck med hele teamet, eller noget hvor modtagerne ønsker et permanent link, de kan komme tilbage til om en måned — så er SlothBox det forkerte værktøj. Brug Dropbox, Google Drive eller det, din arbejdsgang er bygget på. Krypteringsdisciplinen her koster dig bekvemmeligheden ved et permanent link, og den byttehandel betaler sig kun, når filen faktisk er følsom.",
  },
  "about.tradeoffs.heading": {
    en: "What you give up",
    da: "Hvad du afgiver",
  },
  "about.tradeoffs.body": {
    en: "Every architectural decision trades something. SlothBox runs on one ARM virtual machine in Falkenstein, Germany — not a global edge network — so a four-gigabyte download from a Tokyo client takes longer than the same file from WeTransfer. Files have an expiry; there is no permanent shareable link. The recipient needs the complete URL including the part after “#”, which means a chat client that strips fragments breaks the share. And v0.1.0-alpha has not been independently audited yet — the underlying primitives (libsodium, age) have, but the SlothBox glue around them is gated on external cryptographer review before any “production-grade” wording lands. Until v1.0, this is appropriate for portfolio review and personal experimentation, not for high-stakes secrets.",
    da: "Hvert arkitekturvalg er en byttehandel. SlothBox kører på én ARM-virtuel maskine i Falkenstein, Tyskland — ikke et globalt edge-netværk — så en fire-gigabyte-download til en kunde i Tokyo tager længere tid end samme fil fra WeTransfer. Filer udløber; der findes ikke noget permanent delingslink. Modtageren har brug for hele URL'en inklusive delen efter “#”, så en chatklient, der fjerner fragmenter, bryder delingen. Og v0.1.0-alpha er endnu ikke uafhængigt auditeret — de underliggende primitiver (libsodium, age) er, men SlothBox-integrationen omkring dem er gate'et på ekstern kryptografgennemgang, før nogen “production-grade”-formulering rammer pladen. Indtil v1.0 er dette egnet til portfolio-gennemgang og personlig test, ikke til kritiske hemmeligheder.",
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
    en: "Self-destructs the moment the FIRST complete download finishes. The link still works for whoever opens it first — but anyone clicking it after, including a forwarded copy, sees a “doesn't exist” page. Two people opening the link in the same instant can race and both succeed; treat this as one-shot delivery to a trusted channel, not an unbreakable single-recipient lock.",
    da: "Destrueres i samme øjeblik den FØRSTE komplette download afsluttes. Linket virker for den, der åbner det først — men alle, der klikker bagefter (også en videresendt kopi), ser en “findes ikke”-side. To personer, der åbner linket i samme øjeblik, kan begge nå at hente filen; brug det som engangslevering til en pålidelig kanal, ikke som ubrydelig modtager-lås.",
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

  // ─── Landing — "Why this, not WeTransfer" ─────────────────────
  // Six-row comparison table. Each row names a real product and the
  // deal-breaker for someone who actually cares about confidentiality.
  // Sourced from each product's public ToS / privacy policy as of
  // 2026-05; if any vendor disputes a claim, the README's repo issue
  // tracker is the place to debate facts.
  "whyNot.eyebrow": {
    en: "Against the alternatives",
    da: "Op imod alternativerne",
  },
  "whyNot.heading": {
    en: "Most “send a file” services scan, store, or sell.",
    da: "De fleste “send en fil”-tjenester scanner, gemmer eller sælger.",
  },
  "whyNot.lede": {
    en: "Every option below is a fine product for what it does. None of them gives you confidentiality the operator can't break — that's the gap SlothBox fills.",
    da: "Hver af mulighederne herunder er et fint produkt til sit formål. Ingen af dem giver dig fortrolighed, som operatøren ikke selv kan bryde — det er hullet, SlothBox fylder.",
  },
  "whyNot.row1.product": {
    en: "WeTransfer",
    da: "WeTransfer",
  },
  "whyNot.row1.body": {
    en: "Scans your file. Keeps a copy. Monetises via ads.",
    da: "Scanner din fil. Beholder en kopi. Tjener penge på reklamer.",
  },
  "whyNot.row2.product": {
    en: "Dropbox Transfer",
    da: "Dropbox Transfer",
  },
  "whyNot.row2.body": {
    en: "Reads your content. US-cloud infrastructure — Schrems II contested for EU data.",
    da: "Læser dit indhold. Amerikansk skyinfrastruktur — Schrems II er bestridt for EU-data.",
  },
  "whyNot.row3.product": {
    en: "Google Drive share",
    da: "Google Drive-deling",
  },
  "whyNot.row3.body": {
    en: "Same as Dropbox. Plus advertising-graph pings on every link click.",
    da: "Samme som Dropbox. Plus reklame-graf-pings ved hvert klik på linket.",
  },
  "whyNot.row4.product": {
    en: "Wormhole.app",
    da: "Wormhole.app",
  },
  "whyNot.row4.body": {
    en: "End-to-end encrypted. No signed delivery proof. No EU-only data path.",
    da: "End-to-end-krypteret. Intet signeret leveringsbevis. Ingen kun-EU-datapath.",
  },
  "whyNot.row5.product": {
    en: "Proton Drive",
    da: "Proton Drive",
  },
  "whyNot.row5.body": {
    en: "Encrypted. Account-only, paid, no quick-share for unauthenticated recipients.",
    da: "Krypteret. Kun for konti, betalt, ingen quick-share til ikke-autentificerede modtagere.",
  },
  "whyNot.row6.product": {
    en: "Email attachment",
    da: "Email-vedhæftning",
  },
  "whyNot.row6.body": {
    en: "25 MB cap. Stored forever in both inboxes. Indexed by both providers.",
    da: "25 MB-loft. Gemt for evigt i begge indbakker. Indekseret af begge udbydere.",
  },
  "whyNot.col.product": {
    en: "Service",
    da: "Tjeneste",
  },
  "whyNot.col.gap": {
    en: "What it gives up",
    da: "Hvad den giver afkald på",
  },

  // ─── Landing — "When you'd reach for this" ────────────────────
  // Four concrete scenarios. Sole-proprietor / Danish-context framing
  // because that's who Philip actually serves; the patterns generalise
  // but the specifics make it feel real.
  "useCases.eyebrow": {
    en: "When you'd reach for this",
    da: "Hvornår man rækker ud efter det",
  },
  "useCases.heading": {
    en: "Concrete moments — not abstract claims.",
    da: "Konkrete situationer — ikke abstrakte påstande.",
  },
  "useCases.lede": {
    en: "If any of these match the file you're about to send, SlothBox is the right tool. If none do, email or WeTransfer is probably fine — pick what fits the threat.",
    da: "Hvis nogen af disse passer på den fil, du er ved at sende, er SlothBox det rigtige værktøj. Hvis ingen passer, er email eller WeTransfer sikkert fint — vælg det, der matcher truslen.",
  },
  "useCases.item1.title": {
    en: "Sending a contract or NDA to a client",
    da: "Aftaler og NDA'er til en kunde",
  },
  "useCases.item1.body": {
    en: "An email attachment lives in both inboxes forever. WeTransfer keeps a copy on US infrastructure for seven days. SlothBox burns the share the moment the recipient finishes downloading — the encrypted blob is gone, and because the decryption key never reached the server, even a future backup restore returns ciphertext.",
    da: "En email-vedhæftning ligger for evigt i begge indbakker. WeTransfer beholder en kopi på amerikansk infrastruktur i syv dage. SlothBox brænder delingen i samme øjeblik, modtageren har downloadet — den krypterede fil er væk, og fordi dekrypteringsnøglen aldrig nåede serveren, vil selv en fremtidig backup-restaurering kun give ciphertext tilbage.",
  },
  "useCases.item2.title": {
    en: "Files where confidentiality outweighs convenience",
    da: "Filer hvor fortrolighed vejer tungere end bekvemmelighed",
  },
  "useCases.item2.body": {
    en: "Anything you don't want sitting on US infrastructure for seven days, indexed by an advertising graph, or read by a content-moderation pipeline. EU-hosted by infrastructure choice — not by a region label on a US cloud. The operator cannot decrypt what you upload. A subpoena returns ciphertext.",
    da: "Alt det, du ikke vil have liggende på amerikansk infrastruktur i syv dage, indekseret af en reklame-graf eller læst af en indholdsmoderations-pipeline. EU-hostet via infrastrukturvalget — ikke via et regionsstempel på en amerikansk sky. Operatøren kan ikke dekryptere det, du uploader. En retskendelse får kun ciphertext.",
  },
  "useCases.item3.title": {
    en: "Source code or build artifacts with secrets",
    da: "Kildekode eller build-artefakter med hemmeligheder",
  },
  "useCases.item3.body": {
    en: "API keys for a one-time client setup. Infrastructure config. Pre-release builds you don't want a Slack history to retain. No DM kept forever, no GitHub gist that's accidentally public. One link, one download, gone.",
    da: "API-nøgler til en engangs-kundeopsætning. Infrastruktur-config. Pre-release-builds, du ikke vil have liggende i en Slack-historik. Ingen DM, der bliver liggende for evigt, ingen GitHub-gist, der ved et uheld er offentlig. Ét link, én download, væk.",
  },
  "useCases.item4.title": {
    en: "One-shot drops where the sender stays anonymous",
    da: "Engangs-drops hvor afsenderen forbliver anonym",
  },
  "useCases.item4.body": {
    en: "No account, no signup. The server hashes the upload IP for rate-limiting and forgets the rest. The recipient gets the URL through whatever channel makes sense. Neither side has an account; the server has no idea who either party is.",
    da: "Ingen konto, ingen tilmelding. Serveren hasher upload-IP'en til rate-limiting og glemmer resten. Modtageren får URL'en gennem en kanal, der giver mening. Ingen af parterne har en konto; serveren ved ikke, hvem nogen af dem er.",
  },

  // ─── Landing — "What you give up" ─────────────────────────────
  // Four tradeoffs. This is the section that makes the rest of the
  // page credible — without an honest "what we don't do" list, every
  // marketing claim above looks pre-packaged. The list is also a tool
  // for the visitor to self-disqualify if SlothBox isn't the right
  // fit, which saves them disappointment and saves us a support
  // email.
  "tradeoffs.eyebrow": {
    en: "What you give up",
    da: "Hvad du afgiver",
  },
  "tradeoffs.heading": {
    en: "The honest list.",
    da: "Den ærlige liste.",
  },
  "tradeoffs.lede": {
    en: "Every architectural decision trades something. These are the ones a visitor evaluating SlothBox should know up front.",
    da: "Hvert arkitekturvalg er en byttehandel. Det her er dem, en besøgende, der overvejer SlothBox, bør kende på forhånd.",
  },
  "tradeoffs.item1.title": {
    en: "The recipient needs the full URL — including #key=…",
    da: "Modtageren skal have hele URL'en — inklusive #key=…",
  },
  "tradeoffs.item1.body": {
    en: "If their chat client strips fragments (old Outlook, certain compliance scanners, some forum software), they get nothing decryptable. Test with a small file first if you're not sure your channel preserves fragments.",
    da: "Hvis modtagerens chatklient fjerner fragmentet (gammel Outlook, visse compliance-scannere, nogle fora), får de ingenting, der kan dekrypteres. Test med en lille fil først, hvis du er i tvivl, om din kanal bevarer fragmentet.",
  },
  "tradeoffs.item2.title": {
    en: "Files have an expiry. No permanent shareable link.",
    da: "Filer udløber. Intet permanent delingslink.",
  },
  "tradeoffs.item2.body": {
    en: "Maximum seven days in v0.1. Expired shares are gone, not soft-deleted — the encrypted blob is removed from MinIO and the share row is destroyed. If the recipient hasn't downloaded by then, you re-send.",
    da: "Maks. syv dage i v0.1. Udløbne delinger er væk — ikke soft-slettet. Den krypterede fil fjernes fra MinIO, og share-rækken destrueres. Hvis modtageren ikke har downloadet inden da, sender du igen.",
  },
  "tradeoffs.item3.title": {
    en: "v0.1 is alpha. Sensitive transfers wait for v1.0.",
    da: "v0.1 er alpha. Følsomme overførsler venter på v1.0.",
  },
  "tradeoffs.item3.body": {
    en: "The cryptographic primitives — libsodium and age — are battle-tested upstream. The SlothBox glue around them has not yet been independently audited. Independent cryptographer review and a third-party pen test gate v1.0 before any “production-grade” framing.",
    da: "De kryptografiske primitiver — libsodium og age — er gennemtestede upstream. SlothBox-integrationen rundt om dem er endnu ikke uafhængigt auditeret. Uafhængig kryptografgennemgang og tredjeparts pen-test er gate-kravet for v1.0 før nogen “production-grade”-formulering.",
  },
  "tradeoffs.item4.title": {
    en: "No CDN. One EU virtual machine.",
    da: "Ingen CDN. Én EU-virtuel maskine.",
  },
  "tradeoffs.item4.body": {
    en: "A four-gigabyte file downloads from one server in Falkenstein, Germany. WeTransfer downloads from two hundred edge points of presence. If your recipient is on a 200 ms link from Tokyo, they will feel it. The trade is bandwidth for jurisdiction — pick what matters more for the file in your hand.",
    da: "En fire-gigabyte fil downloades fra én server i Falkenstein, Tyskland. WeTransfer downloader fra to hundrede edge-punkter. Hvis din modtager sidder på et 200 ms-link fra Tokyo, mærker de det. Byttet er båndbredde mod jurisdiktion — vælg, hvad der vejer tungest for filen, du har i hånden.",
  },
} as const satisfies Record<string, TranslationEntry>;

/** Literal-union of every key in TRANSLATIONS. The `t()` function uses
 *  this so an unknown key is a compile error, never a runtime fallback. */
export type TranslationKey = keyof typeof TRANSLATIONS;
