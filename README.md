# Tuinplanner — startproject

Dit is het prototype uit de chat, omgebouwd tot een project dat je echt kan hosten.
Wat er al in zit: de databasestructuur, de datalaag, het loginscherm en de
PWA-configuratie. Wat er nog moet gebeuren: de schermen uit het prototype
overzetten (stap 5) en offline werking (stap 8).

---

## Stap 1 — Supabase-project aanmaken (30 min)

1. Maak een account op supabase.com en een nieuw project.
2. **Zet de regio op de EU** (bv. Frankfurt) — het gaat om personeelsgegevens.
3. Ga naar **SQL Editor**, plak de volledige inhoud van `supabase/schema.sql`
   en voer uit. Dat maakt alle tabellen, de toegangsregels en wat startgegevens aan.
4. Ga naar **Storage** en maak een **private** bucket met de naam `werffotos`.

## Stap 2 — Gebruikers aanmaken (15 min)

1. **Authentication > Users > Add user**: één per medewerker, met e-mailadres en
   wachtwoord. Wie geen e-mail heeft, geef je een adres van het bedrijf
   (`aidan@jouwbedrijf.be`).
2. Kopieer van elke gebruiker het **UUID**.
3. Ga terug naar de SQL Editor en koppel ze aan een naam en een rol:

```sql
insert into profiles (id, naam, rol) values
  ('<uuid van Olivier>', 'Olivier', 'kantoor'),
  ('<uuid van Aidan>',   'Aidan',   'arbeider'),
  ('<uuid van Oliver>',  'Oliver',  'arbeider');
```

De rol bepaalt alles: `kantoor` mag plannen en beheren, `arbeider` mag enkel de
planning lezen en zijn **eigen** registraties schrijven. Dat is afgedwongen in de
database zelf, niet in de app — een arbeider kan de uren van een ander dus niet
wijzigen, ook niet als hij zou knoeien met de app.

## Stap 3 — Project lokaal draaien (30 min)

```bash
npm install
cp .env.example .env      # vul VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY in
npm run dev
```

Die twee waarden vind je in Supabase onder **Project Settings > API**.
Meld je aan met een van je gebruikers: je zou "Aangemeld als Olivier (kantoor)"
moeten zien.

## Stap 4 — Iconen (10 min)

Zet in `public/` twee PNG's: `icon-192.png` en `icon-512.png` (je logo op een
effen achtergrond). Zonder die twee kan de app niet op het beginscherm gezet worden.

## Stap 5 — De schermen overzetten (1 à 2 dagen, ontwikkelaarswerk)

Neem `tuinplanner.jsx` uit de chat erbij. Kopieer daaruit naar `src/components/`:

- de helpers bovenaan (`klok`, `duur`, `mapsLink`, `dagStatus`, `verplaatsingen`,
  `verkleinFoto`, de datumfuncties, `STARTUREN`);
- `MedewerkerScherm` en `AfrondScherm`;
- `KantoorApp` met `WeekOverzicht`, `Dagplanning`, `WerfBeheer`, `Opvolging`,
  `MateriaalBeheer`, `Rijtijden`.

**Het enige wat structureel wijzigt:** overal waar het prototype
`bewaar({...data, ...})` of `voegEvent({...})` doet, roep je nu de overeenkomstige
functie uit `src/lib/db.js` aan en daarna `herlaad()`. Bijvoorbeeld:

```jsx
// prototype
voegEvent({ medewerkerId: ik.id, datum: dag, type: "dag_start" });

// nu
await schrijfEvent({ datum: dag, type: "dag_start" });
await herlaad();
```

```jsx
// prototype: taak afsluiten
bewaar({ ...data, events: [...], rapporten: [...], werftaken: [...] });

// nu: één functie doet het event, het rapport, de foto's en de status
await sluitTaakAf({ plan, werftaakId: wt.id, datum: dag, tekst, fotos, afgewerkt });
await herlaad();
```

De **vorm van het `data`-object is bewust identiek gebleven** aan die van het
prototype. `dagStatus`, `verplaatsingen`, `H.info` en alle rendering blijven dus
werken zoals ze zijn. Enkel het schrijven verandert.

Verwijder ook de knop **"Alles terugzetten naar demodata"** — die hoort niet in
een productieomgeving.

## Stap 6 — Online zetten (30 min)

1. Zet de code in een private Git-repository (GitHub of GitLab).
2. Maak een account op **Vercel**, importeer de repository.
3. Zet daar dezelfde twee omgevingsvariabelen (`VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`).
4. Deploy. Hang er een eigen domein aan, bv. `planning.jouwbedrijf.be`.

Vanaf nu is elke push naar de repository automatisch live.

## Stap 7 — Op de gsm zetten (10 min per toestel)

Open het adres in **Chrome** (Android) of **Safari** (iPhone) en kies
"Toevoegen aan beginscherm". De app opent dan zonder browserbalk, met camera- en
Maps-toegang. Geen app store nodig.

## Stap 8 — Offline werking (2 à 4 dagen — doe dit vóór de proefperiode)

Dit is het enige echt lastige stuk, en het is niet optioneel: op een werf zonder
bereik gaan registraties nu verloren.

Het principe: schrijf elke registratie eerst naar **IndexedDB** op het toestel en
zet ze in een wachtrij. Een service worker duwt de wachtrij naar Supabase zodra er
verbinding is. Foto's idem — die zijn het zwaarste en het traagste.
Toon in de app duidelijk of iets al gesynchroniseerd is.

Praktisch: `schrijfEvent` en `sluitTaakAf` in `db.js` zijn de enige twee plaatsen
die schrijven. Precies daar hangt de wachtrij aan. Daarom staat alle schrijflogica
in één bestand.

## Stap 9 — Vóór de eerste echte dag

- **Sociaal secretariaat contacteren.** Je registreert werktijden en verplaatsingen
  van werknemers. Informeer je mensen schriftelijk over wat je bijhoudt, waarom, en
  hoe lang je het bewaart. De rijtijd-trigger is het gevoeligste onderdeel.
- **Back-ups nakijken** in Supabase (dagelijkse back-up staat standaard aan).
- **Bewaartermijn afspreken** en later een opkuistaak voorzien.

---

## Wat het kost

| | |
|---|---|
| Supabase | gratis tot ruim boven jullie volume |
| Vercel | gratis voor dit gebruik |
| Domeinnaam | ~15 euro per jaar |
| Ontwikkelaar | stappen 5 en 8 — reken op 1 à 2 weken |

## Bestandsoverzicht

```
supabase/schema.sql      Alle tabellen, toegangsregels, startgegevens
src/lib/supabase.js      Verbinding met de backend
src/lib/db.js            Datalaag — vervangt window.storage. Alle schrijfacties zitten hier.
src/components/Login.jsx Aanmelden met e-mail en wachtwoord
src/App.jsx              Sessie, rol, en het laden van de gegevens
vite.config.js           Bouwconfiguratie + PWA (op het beginscherm zetten)
```
