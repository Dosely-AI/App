# Care network — legal and regulatory projection

> **Not legal advice.** This is an engineering team's map of the ground, to plan
> with and to take to qualified healthcare-regulatory counsel. Statuses are as of
> September 2026; several of these rules are moving, so verify each one before
> relying on it.

## Where Dosely stands

| Today | Implication |
|---|---|
| A consumer app; data stays on the device unless the user signs in | Mostly FTC and state consumer-health law, not HIPAA |
| Care network **pilot**: patient-directed sharing with pharmacies and prescribers, signed prescriptions between them | The moment pharmacies or prescribers use Dosely *for their own work*, Dosely becomes their **HIPAA business associate** for that data |
| Prescriptions travel inside Dosely only | Not an e-prescribing network. It can't replace Surescripts/NCPDP routing, and it refuses controlled substances |

The two hats matter: data the patient keeps and shares is consumer health data;
the same data in a pharmacy's worklist is protected health information (PHI).
The vault's design (per-patient keys, scoped grants, purpose of use, audit trail,
erase) is meant to satisfy both.

## The rules, and what triggers them

| Area | What it requires | When it applies to Dosely | What's built / next |
|---|---|---|---|
| **HIPAA Privacy, Security & Breach Notification Rules** | Business associate agreements (BAAs); risk analysis; administrative, physical and technical safeguards; minimum necessary; breach notice | When a covered entity (pharmacy, prescriber) uses Dosely to handle PHI | Built: encryption at rest, access control, audit, minimum-necessary scopes. Next: BAAs, risk analysis, policies, training, incident response |
| **HIPAA Security Rule update (proposed)** | Would make encryption, MFA, asset inventory, 72-hour restoration and annual audits mandatory rather than "addressable" | NPRM published Jan 6, 2025; OCR's final action has slipped (OMB now lists July 2027). Treat it as the bar anyway | Encryption at rest and passkeys (phishing-resistant MFA) already in place |
| **FTC Health Breach Notification Rule** (amended, effective July 29, 2024) | Health apps are "vendors of personal health records"; an *unauthorized disclosure* is a breach, not just a hack; notify users, FTC and sometimes media | Now, for the consumer side | No ad-tech or analytics SDKs touching health data; sharing only by explicit patient action |
| **FTC Act §5** | No deceptive or unfair data practices (see GoodRx and BetterHelp orders, 2023) | Now | Plain-language consent screens that show exactly what is shared (the preview) |
| **Washington My Health My Data Act** (and similar laws in Nevada, Connecticut) | Separate consent to *collect* and to *share* consumer health data; written authorization to sell; right to delete; private right of action (WA) | Now, for users in those states | Consent is per provider and per scope; erase is built. Next: WA-compliant consumer health data privacy policy and consent records |
| **California CMIA / CCPA-CPRA** | Apps that maintain medical information can be treated as providers under CMIA; health data is sensitive personal information under CPRA | Now, for California users | Same controls; add CPRA notices and request handling |
| **42 CFR Part 2** (substance-use-disorder records) | Consent and redisclosure limits for records from Part 2 programs; compliance date Feb 16, 2026, and OCR now enforces it | If Dosely receives records from SUD treatment programs | Not ingested today. If added: segmented data, Part 2 notices and consent |
| **E-prescribing standards** | NCPDP SCRIPT 2017071 today; **SCRIPT 2023011 exclusively from Jan 1, 2028** for Medicare Part D (CMS-4205-F2); network certification (Surescripts) | Only if Dosely routes real prescriptions | Do not build a network: integrate through a certified intermediary or the prescriber's EHR |
| **State e-prescribing mandates** | Many states require electronic prescribing (often for all controlled substances, some for all drugs) through certified systems | If prescribers rely on Dosely to meet them | They can't, today — labeled as a pilot |
| **Controlled substances — DEA EPCS** (21 CFR Part 1311), **SUPPORT Act** | Third-party-audited application, identity proofing, two-factor signing, access controls, digital signatures, audit; EPCS required for Part D controlled drugs | Only for Schedule II–V prescriptions | **Refused by the vault** (`UNSUPPORTED`). Long-term only via an audited EPCS product |
| **Telemedicine prescribing (Ryan Haight Act)** | In-person requirement for controlled substances, currently waived under DEA/HHS flexibilities **through Dec 31, 2026** (fourth extension); a permanent rule is pending | Only with controlled substances | Not applicable while controlled substances are refused |
| **Pharmacy practice & med sync** | State board rules on outreach and refill authorization; most states have medication-synchronization laws that let pharmacies short-fill and prorate copays | The worklist and med-sync plan | Dosely suggests; the pharmacist decides, fills and bills |
| **Fraud & abuse** | Anti-Kickback Statute, state patient-brokering laws, patient freedom to choose a pharmacy | As soon as money flows between Dosely and pharmacies or prescribers | Patient picks the pharmacy; never charge or pay per referral or prescription. Get counsel on pricing before revenue |
| **Information blocking** (21st Century Cures Act, 45 CFR Part 171) | Actors must not unreasonably interfere with access, exchange or use of electronic health information | If Dosely becomes a health information network/exchange connecting unaffiliated organizations | Design for export: FHIR APIs, patient access to everything |
| **Interoperability** | HL7 FHIR R4 / US Core, SMART on FHIR app launch, USCDI; TEFCA for national exchange | For EHR integration | The vault's typed protocol maps cleanly to FHIR `MedicationRequest`, `MedicationDispense`, `MedicationStatement` |
| **FDA — software as a medical device** | Clinical decision support aimed at clinicians is non-device only if they can independently review the basis (FDA CDS guidance, 2022); patient adherence and reminder tools generally fall under enforcement discretion | Risk scores and the worklist | Every flag shows its reasons and data; nothing auto-acts. Keep it that way, and document intended use |
| **Provider identity** | Verify NPI (NPPES), licenses and, for EPCS, NIST SP 800-63 identity assurance (IAL2) | Before prescribers can prescribe | NPI check digit enforced; `verified` flag gates prescribing; manual verification ops next |
| **Security attestations** | Not legally required, but pharmacies and health systems ask: SOC 2 Type II, HITRUST, penetration tests; FIPS 140-3 validated crypto for breach safe harbor and federal work | Before selling to organizations | Architecture is ready; see crypto note below |
| **International** (GDPR Art. 9, UK GDPR, PIPEDA/PHIPA) | Explicit consent, DPIAs, data residency | Only on expansion | Per-patient keys make regional key custody feasible |

**Crypto note.** The vault uses Monocypher (audited) with XChaCha20-Poly1305.
It is not a FIPS 140-3 validated module, and HHS's "unusable, unreadable" breach
safe harbor points to NIST guidance built on validated cryptography. Before
handling PHI for covered entities in production, swap in AES-256-GCM, HKDF,
HMAC-SHA-512 and Ed25519 (approved in FIPS 186-5) from a validated module, and
hold the key-encryption key in a cloud KMS or HSM. Formats are versioned for this.

## Phased roadmap

**Phase 0 — now (pilot).** Consumer app plus the sandboxed care network: patient
consent, encrypted vault, audit, no controlled substances, clearly labeled.
Use test data or friendly pilot sites only.

**Phase 1 — pharmacy pilot as a business associate (≈ 0–6 months).**
BAAs with pilot pharmacies; HIPAA risk analysis and written policies; workforce
training; incident-response and breach-notification plan; KMS-held keys and
validated crypto; privacy policy and consent records for WA/NV/CT/CA; provider
verification operations; external penetration test; SOC 2 Type I.

**Phase 2 — prescribers through their systems (≈ 6–18 months).** SMART on FHIR
app inside EHRs rather than a parallel prescribing path; real prescriptions go
through a certified e-prescribing intermediary (SCRIPT 2023011-ready ahead of
Jan 1, 2028); SOC 2 Type II or HITRUST.

**Phase 3 — scale (18 months +).** EPCS only via an audited product and IAL2
identity proofing; TEFCA participation; Part D plan partnerships (the adherence
measures behind Medicare Star Ratings use the same PDC the vault computes);
outcome studies to show fewer missed doses and fewer lapses in therapy.

## What the code already does for compliance

- Encryption at rest with per-patient keys; crypto-shredding on request
- Consent: per-provider, per-scope, time-limited, revocable, one-time invites
- Minimum necessary enforced by construction (scopes decide what is computed)
- Purpose of use recorded for every provider access
- Tamper-evident audit trail, including refused attempts; patients can see it
- Step-up re-authentication for prescribing and erasure
- Signed prescriptions, verified on every read; controlled substances refused

## Sources

- HIPAA Security Rule NPRM — [Federal Register, Jan 6, 2025](https://www.federalregister.gov/documents/2025/01/06/2024-30983/hipaa-security-rule-to-strengthen-the-cybersecurity-of-electronic-protected-health-information); [HHS NPRM page](https://www.hhs.gov/hipaa/for-professionals/security/hipaa-security-rule-nprm/index.html); [timeline update (HIPAA Journal)](https://www.hipaajournal.com/hipaa-security-rule-update-postponed/)
- FTC Health Breach Notification Rule — [final rule](https://www.federalregister.gov/documents/2024/05/30/2024-10855/health-breach-notification-rule); [FTC compliance guide](https://www.ftc.gov/business-guidance/resources/complying-ftcs-health-breach-notification-rule-0)
- 42 CFR Part 2 — [compliance deadline (HIPAA Journal)](https://www.hipaajournal.com/february-16-2026-compliance-deadline-part-2-final-rule/)
- E-prescribing standards — [CMS adopted standards](https://www.cms.gov/medicare/regulations-guidance/electronic-prescribing/adopted-standard-and-transactions); [CMS-4205-F2](https://www.federalregister.gov/documents/2024/06/17/2024-12842/medicare-program-medicare-prescription-drug-benefit-program-health-information-technology-standards)
- DEA telemedicine flexibilities — [fourth temporary extension](https://www.federalregister.gov/documents/2025/12/31/2025-24123/fourth-temporary-extension-of-covid-19-telemedicine-flexibilities-for-prescription-of-controlled)
