# DoselyAI

A simple, **local-only** medication companion. DoselyAI does four things:

1. **Explains your medications** — a plain-language overview of what each one is for, grounded in official FDA labeling (optionally rewritten by AI if you add your own key).
2. **Reminds & tracks doses** — add your medications and how often you take them, get an on-device reminder at each dose time, tap "I took it," and see your history visualized.
3. **Rates your adherence** — an adherence score, trends, and personalized, rule-based tips to help you stay on track.
4. **Predicts refills** — enter how many pills you have and DoselyAI projects your days of supply, shows when each medication runs out, and reminds you before it does.

Everything stays **on your device**. There is no account and nothing is uploaded to any server.

> ⚕️ **Not medical advice.** DoselyAI is an informational adherence tracker, not a medical
> device. It never tells you to start, stop, or change a medication. Always consult your
> doctor or pharmacist. Drug information comes from public FDA/RxNorm data, not invented by AI.

## Tech stack

- **App:** Expo (React Native) + Expo Router + TypeScript.
- **Local data:** Zustand + AsyncStorage (on-device only).
- **Drug info:** RxNorm (name matching) + openFDA drug labels (grounded facts).
- **Optional AI:** Anthropic Claude, called with *your own* API key, stored only in the device secure store.
- **Forms/validation:** React Hook Form + Zod. **Tests:** Jest.

## Run it

```bash
npm install
npx expo start        # then scan the QR code with the Expo Go app on your phone
```

That's it — no configuration needed. Add medications in the **Meds** tab, check off doses on
**Today**, and see your rating on **Insights**.

**Optional — AI summaries:** in **Settings**, paste an Anthropic API key to have Claude rewrite
the FDA information into a short, plain-language summary. The key is stored only on your device
(Keychain/Keystore) and sent only to Anthropic. Without a key, DoselyAI shows the FDA text directly.

## Project structure

```
src/
  app/                        # Expo Router screens
    (tabs)/                   # Today, Meds, Insights, Settings
    medication/new.tsx        # add a medication
    medication/[id].tsx       # medication overview + edit + delete
  components/                 # Screen, Card, Disclaimer, ui/{button,text-field}
  features/
    adherence/                # dates + adherence engine (pure, tested)
    medications/              # schema, schedule helpers, RxNorm, form components
  lib/
    drug/                     # rxnorm.ts, openfda.ts (grounded drug info)
    ai/                       # optional Claude summary + secure key storage
  store/                      # Zustand store (medications + dose logs)
```

## Scripts

- `npm start` / `npx expo start` — dev server
- `npm run android` / `ios` / `web` — open a platform
- `npm test` — run the Jest suite (adherence math, schedule, schema, refill prediction, drug clients)
- `npx tsc --noEmit` — type-check

## What's next (not yet built)

- Optional cloud sync / caregiver sharing (the app was designed so this can be added later).
- Barcode / pill scanning to add a medication without typing.
- Drug-interaction checks across your medication list.

## Privacy

All medication and dose data lives in on-device storage. Reset it anytime in **Settings → Reset
all data**. The only network calls are anonymous drug-info lookups (RxNorm/openFDA, drug name only)
and — if you opt in — Claude requests with your own key.
