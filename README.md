# Rikken Scorebord

## 1. Database klaarzetten (eenmalig)

1. Ga naar je project op [supabase.com](https://supabase.com).
2. Open **SQL Editor** → **New query**.
3. Plak de inhoud van `supabase-setup.sql` erin en klik op **Run**.

Dat maakt de tabel aan waar de app de stand in bewaart.

## 2. Lokaal uitproberen (optioneel)

Heb je Node.js geïnstalleerd, dan kun je de app eerst lokaal bekijken:

```bash
npm install
npm run dev
```

Open de link die in je terminal verschijnt (meestal `http://localhost:5173`).

## 3. Online zetten via Vercel

**Met GitHub (aanbevolen — makkelijk bij te werken):**

1. Zet deze map in een nieuwe GitHub-repository (bijvoorbeeld via [github.com/new](https://github.com/new), of met GitHub Desktop als je niet met de command line werkt).
2. Ga naar [vercel.com](https://vercel.com), log in met je GitHub-account.
3. Klik **Add New → Project**, kies je repository.
4. Vercel herkent automatisch dat het een Vite-project is. Klik **Deploy**.
5. Na een paar minuten krijg je een link zoals `rikken-scorebord.vercel.app`.

**Zonder GitHub:**

1. Ga naar [vercel.com](https://vercel.com) en maak een gratis account.
2. Installeer de Vercel command line tool: `npm i -g vercel`
3. Draai in deze map: `vercel`
4. Volg de vragen op het scherm (project aanmaken, deployen).

## 4. Op je telefoon zetten

Open de Vercel-link in de browser van je telefoon, en kies:

- **iPhone (Safari):** Deelknop → "Zet op beginscherm"
- **Android (Chrome):** Menu (⋮) → "Toevoegen aan startscherm"

De app opent dan als een gewone app, met een eigen icoontje, zonder adresbalk.

## Hoe de opslag werkt

Alle spelers, rondes en de stand staan in de tabel `rikken_state` in je
Supabase-project (in één rij met alle gegevens als JSON). Iedereen die de
website-link opent, ziet en bewerkt dezelfde stand — handig als je 'm tijdens
het spel met meerdere telefoons open hebt staan.
