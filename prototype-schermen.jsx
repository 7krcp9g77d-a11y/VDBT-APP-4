import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Clock, MapPin, Package, Check, Truck, Home, Plus, Trash2, AlertTriangle,
  ChevronLeft, ChevronRight, Users, Wrench, CalendarDays, Play, Navigation,
  Camera, X, PauseCircle, ListChecks, Settings
} from "lucide-react";

const KEY = "tuinplanner:data:v5";
const ATELIER = "atelier";

/* ---------- helpers ---------- */
const vandaag = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 9);
const klok = (ts) => new Date(ts).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
const duur = (min) => {
  if (min == null) return "—";
  const m = Math.round(min);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}u ${String(m % 60).padStart(2, "0")}`;
};
const minutenTussen = (a, b) => (new Date(b) - new Date(a)) / 60000;
const paar = (a, b) => [a, b].sort().join("~");
const mapsLink = (adres) =>
  `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(adres || "")}`;
const maandagVan = (iso) => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
const plusDagen = (iso, n) => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const dagLabel = (iso) =>
  new Date(iso + "T12:00:00").toLocaleDateString("nl-BE", { weekday: "short", day: "numeric", month: "short" });
const startuurKey = (datum, medId) => `${datum}|${medId}`;

/* kwartieren van 06:00 tot 12:00 — vroeger of later start een tuinploeg zelden */
const STARTUREN = Array.from({ length: 25 }, (_, i) => {
  const min = 6 * 60 + i * 15;
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
});
const SNELSTART = ["07:00", "07:30", "08:00", "08:30"];
const minutenNaMiddernacht = (hhmm) => {
  const [h, m] = (hhmm || "").split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : null;
};

/* foto verkleinen: een gsm-foto van 4 MB past niet in de gedeelde opslag */
const verkleinFoto = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("lezen mislukt"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("geen geldige afbeelding"));
      img.onload = () => {
        const max = 900;
        const schaal = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * schaal);
        c.height = Math.round(img.height * schaal);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.55));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

/* ---------- startdata (demo) ---------- */
const seed = () => {
  const d = vandaag();
  const morgen = plusDagen(d, 1);
  return {
    materialen: [
      { id: "m1", naam: "Kettingzaag" },
      { id: "m2", naam: "Bosmaaier" },
      { id: "m3", naam: "Haagschaar" },
      { id: "m4", naam: "Zitmaaier" },
      { id: "m5", naam: "Aanhangwagen" },
      { id: "m6", naam: "Bladblazer" },
      { id: "m7", naam: "Kruiwagen + spades" },
      { id: "m8", naam: "Trilplaat" },
    ],
    taaktypes: [
      { id: "t1", naam: "Haag scheren", materiaalIds: ["m3", "m6", "m5"], standaardDuur: 120 },
      { id: "t2", naam: "Gazon maaien", materiaalIds: ["m4", "m6"], standaardDuur: 90 },
      { id: "t3", naam: "Boom vellen", materiaalIds: ["m1", "m5"], standaardDuur: 180 },
      { id: "t4", naam: "Terras aanleggen", materiaalIds: ["m8", "m7", "m5"], standaardDuur: 960 },
    ],
    werven: [
      { id: "w1", klant: "Familie Peeters", adres: "Dorpsstraat 12, 9800 Deinze" },
      { id: "w2", klant: "Residentie De Linde", adres: "Lindelaan 4, 9000 Gent" },
      { id: "w3", klant: "Bakkerij Claes", adres: "Markt 8, 9880 Aalter" },
    ],
    medewerkers: [
      { id: "p0", naam: "Olivier" },
      { id: "p1", naam: "Aidan" },
      { id: "p2", naam: "Oliver" },
    ],
    atelier: { klant: "Atelier", adres: "Nijverheidsstraat 3, 9800 Deinze" },
    /* wat er op elke werf moet gebeuren — los van de dagplanning */
    werftaken: [
      { id: "wt1", werfId: "w1", taaktypeId: "t1", extra: [], opmerking: "Achteraan beginnen", meerdaags: false, status: "open" },
      { id: "wt2", werfId: "w2", taaktypeId: "t2", extra: ["m2"], opmerking: "", meerdaags: false, status: "open" },
      { id: "wt3", werfId: "w2", taaktypeId: "t3", extra: [], opmerking: "Buur verwittigen", meerdaags: false, status: "open" },
      { id: "wt4", werfId: "w3", taaktypeId: "t4", extra: [], opmerking: "Klant is thuis na 14u", meerdaags: true, status: "open" },
    ],
    /* dagplanning: welke werftaak, op welke dag, door wie */
    planning: [
      { id: "pl1", werftaakId: "wt1", datum: d, medewerkerIds: ["p1"] },
      { id: "pl2", werftaakId: "wt2", datum: d, medewerkerIds: ["p1", "p0"] },
      { id: "pl3", werftaakId: "wt4", datum: d, medewerkerIds: ["p2", "p0"] },
      { id: "pl4", werftaakId: "wt4", datum: morgen, medewerkerIds: ["p2", "p0"] },
      { id: "pl5", werftaakId: "wt3", datum: morgen, medewerkerIds: ["p1"] },
    ],
    starturen: {
      [startuurKey(d, "p0")]: "08:00",
      [startuurKey(d, "p1")]: "07:30",
      [startuurKey(d, "p2")]: "07:30",
      [startuurKey(morgen, "p1")]: "07:30",
      [startuurKey(morgen, "p2")]: "07:30",
    },
    rijtijden: {
      [paar(ATELIER, "w1")]: 15,
      [paar(ATELIER, "w2")]: 25,
      [paar(ATELIER, "w3")]: 20,
      [paar("w1", "w2")]: 12,
      [paar("w1", "w3")]: 18,
      [paar("w2", "w3")]: 10,
    },
    events: [],
    rapporten: [], // notities + foto's bij het stoppen van een taak
  };
};

/* ---------- dagstatus uit events afleiden ---------- */
function dagStatus(events) {
  const s = { gestart: false, locatie: ATELIER, onderweg: null, actiefPlanId: null, gestopt: [], dagEinde: false };
  for (const e of events) {
    if (e.type === "dag_start") { s.gestart = true; s.locatie = ATELIER; }
    if (e.type === "vertrek") { s.onderweg = { van: e.van, naar: e.naar, ts: e.ts, planId: e.planId }; s.locatie = null; }
    if (e.type === "aankomst") {
      s.locatie = e.naar;
      s.onderweg = null;
      if (e.planId) s.actiefPlanId = e.planId;
    }
    if (e.type === "taak_stop") { s.gestopt.push(e.planId); s.actiefPlanId = null; }
    if (e.type === "dag_einde") s.dagEinde = true;
  }
  return s;
}

function verplaatsingen(events, rijtijden) {
  const out = [];
  let open = null;
  for (const e of events) {
    if (e.type === "vertrek") open = e;
    if (e.type === "aankomst" && open) {
      const werkelijk = minutenTussen(open.ts, e.ts);
      const norm = rijtijden[paar(open.van, e.naar)] ?? null;
      const drempel = norm == null ? null : norm + Math.max(10, norm * 0.5);
      out.push({ van: open.van, naar: e.naar, start: open.ts, eind: e.ts, werkelijk, norm, teLang: drempel != null && werkelijk > drempel });
      open = null;
    }
  }
  return out;
}

/* ================= APP ================= */
export default function Tuinplanner() {
  const [data, setData] = useState(null);
  const [fout, setFout] = useState(null);
  const [gebruiker, setGebruiker] = useState(null);
  const [datum, setDatum] = useState(vandaag());

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(KEY, true);
        setData(JSON.parse(r.value));
      } catch {
        const s = seed();
        try { await window.storage.set(KEY, JSON.stringify(s), true); } catch { /* offline */ }
        setData(s);
      }
    })();
  }, []);

  const bewaar = async (next) => {
    setData(next);
    try {
      await window.storage.set(KEY, JSON.stringify(next), true);
      setFout(null);
    } catch {
      setFout("Opslaan lukte niet — mogelijk zijn de foto's te zwaar. Probeer opnieuw.");
    }
  };

  if (!data) return <div className="p-8 text-center text-stone-500">Planning laden…</div>;

  const H = {
    materiaal: (id) => data.materialen.find((m) => m.id === id)?.naam ?? "?",
    werf: (id) => (id === ATELIER ? (data.atelier ?? { klant: "Atelier", adres: "" }) : data.werven.find((w) => w.id === id)),
    taaktype: (id) => data.taaktypes.find((t) => t.id === id),
    medewerker: (id) => data.medewerkers.find((p) => p.id === id),
    werftaak: (id) => data.werftaken.find((w) => w.id === id),
    startuur: (medId, dag) => data.starturen?.[startuurKey(dag, medId)] ?? "",
    planVan: (medId, dag) =>
      data.planning.filter((p) => p.datum === dag && (p.medewerkerIds ?? []).includes(medId)),
    eventsVan: (medId, dag) =>
      data.events.filter((e) => e.medewerkerId === medId && e.datum === dag).sort((a, b) => new Date(a.ts) - new Date(b.ts)),
  };
  H.materiaalVoorWerftaak = (wt) => {
    if (!wt) return [];
    const tt = H.taaktype(wt.taaktypeId);
    return [...new Set([...(tt?.materiaalIds ?? []), ...(wt.extra ?? [])])];
  };
  H.info = (plan) => {
    const wt = H.werftaak(plan.werftaakId);
    return { wt, werf: H.werf(wt?.werfId), tt: H.taaktype(wt?.taaktypeId), materiaal: H.materiaalVoorWerftaak(wt) };
  };

  const voegEvent = (e) =>
    bewaar({ ...data, events: [...data.events, { id: uid(), ts: new Date().toISOString(), ...e }] });

  /* ---------------- LOGIN ---------------- */
  if (!gebruiker) {
    return (
      <div className="min-h-screen bg-stone-50 p-6 font-sans">
        <div className="mx-auto max-w-md">
          <div className="mb-8 mt-6">
            <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-emerald-700">Tuinplanner</div>
            <h1 className="text-3xl font-bold text-stone-900">Wie ben je?</h1>
            <p className="mt-1 text-sm text-stone-500">Kies je naam om je dag te starten.</p>
          </div>
          <div className="space-y-3">
            {data.medewerkers.map((p) => (
              <button
                key={p.id}
                onClick={() => setGebruiker({ rol: "medewerker", id: p.id })}
                className="flex w-full items-center justify-between rounded-2xl border border-stone-200 bg-white p-5 text-left shadow-sm hover:border-emerald-600"
              >
                <span className="text-lg font-semibold text-stone-900">{p.naam}</span>
                <span className="text-xs text-stone-400">{H.planVan(p.id, vandaag()).length} taken vandaag</span>
              </button>
            ))}
            <button
              onClick={() => setGebruiker({ rol: "kantoor" })}
              className="flex w-full items-center gap-3 rounded-2xl bg-stone-900 p-5 text-left text-white hover:bg-stone-800"
            >
              <Users size={20} />
              <span className="text-lg font-semibold">Olivier — kantoor</span>
            </button>
          </div>
          <p className="mt-6 text-xs text-stone-400">
            Alle planning, tijden en foto's worden centraal gedeeld: iedereen die deze app opent, ziet dezelfde gegevens.
          </p>
        </div>
      </div>
    );
  }

  if (gebruiker.rol === "medewerker") {
    return (
      <MedewerkerScherm
        ik={H.medewerker(gebruiker.id)}
        data={data}
        bewaar={bewaar}
        voegEvent={voegEvent}
        H={H}
        fout={fout}
        terug={() => setGebruiker(null)}
      />
    );
  }

  return (
    <KantoorApp
      data={data}
      bewaar={bewaar}
      datum={datum}
      setDatum={setDatum}
      H={H}
      fout={fout}
      terug={() => setGebruiker(null)}
    />
  );
}

/* ================= MEDEWERKER ================= */
function MedewerkerScherm({ ik, data, bewaar, voegEvent, H, fout, terug }) {
  const dag = vandaag();
  const [afronden, setAfronden] = useState(null); // plan-item dat afgerond wordt

  const mijnPlan = H.planVan(ik.id, dag);
  const evs = H.eventsVan(ik.id, dag);
  const st = dagStatus(evs);
  const open = mijnPlan.filter((p) => !st.gestopt.includes(p.id));
  const volgende = open.find((p) => p.id !== st.actiefPlanId) ?? open[0];
  const alleMateriaal = [...new Set(mijnPlan.flatMap((p) => H.info(p).materiaal))];
  const mijnStartuur = H.startuur(ik.id, dag);
  const nu = new Date();
  const teLaat =
    mijnStartuur && !st.gestart &&
    nu.getHours() * 60 + nu.getMinutes() > minutenNaMiddernacht(mijnStartuur) + 10;

  let actie = null;
  if (!st.gestart) {
    actie = { label: "Dag starten op atelier", icon: Play, fn: () => voegEvent({ medewerkerId: ik.id, datum: dag, type: "dag_start" }) };
  } else if (st.onderweg) {
    const best = H.werf(st.onderweg.naar);
    actie = {
      label: `Aangekomen bij ${best?.klant}`,
      icon: MapPin,
      bestemming: best,
      fn: () => voegEvent({ medewerkerId: ik.id, datum: dag, type: "aankomst", naar: st.onderweg.naar, planId: st.onderweg.planId }),
    };
  } else if (st.actiefPlanId) {
    const plan = mijnPlan.find((p) => p.id === st.actiefPlanId);
    actie = { label: "Taak afsluiten", icon: Check, fn: () => setAfronden(plan) };
  } else if (volgende) {
    const w = H.info(volgende).werf;
    actie = {
      label: `Vertrek naar ${w?.klant}`,
      icon: Truck,
      bestemming: w,
      fn: () => voegEvent({ medewerkerId: ik.id, datum: dag, type: "vertrek", van: st.locatie, naar: w && H.werftaak(volgende.werftaakId).werfId, planId: volgende.id }),
    };
  } else if (st.locatie !== ATELIER) {
    actie = {
      label: "Vertrek naar atelier",
      icon: Home,
      bestemming: H.werf(ATELIER),
      fn: () => voegEvent({ medewerkerId: ik.id, datum: dag, type: "vertrek", van: st.locatie, naar: ATELIER }),
    };
  } else if (!st.dagEinde) {
    actie = { label: "Dag afsluiten", icon: Check, fn: () => voegEvent({ medewerkerId: ik.id, datum: dag, type: "dag_einde" }) };
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-44 font-sans">
      <header className="flex items-center gap-3 bg-emerald-800 p-4 text-white">
        <button onClick={terug} className="rounded-full p-1 hover:bg-emerald-700"><ChevronLeft size={20} /></button>
        <div>
          <div className="text-xs uppercase tracking-widest text-emerald-200">
            {new Date(dag + "T12:00:00").toLocaleDateString("nl-BE", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <div className="text-lg font-bold">{ik.naam}</div>
        </div>
        {mijnStartuur && (
          <div className="ml-auto text-right">
            <div className="text-xs text-emerald-200">Startuur</div>
            <div className={`text-lg font-bold ${teLaat ? "text-amber-300" : ""}`}>{mijnStartuur}</div>
          </div>
        )}
      </header>

      <div className="mx-auto max-w-md space-y-5 p-4">
        <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-900">
            <Package size={16} className="text-emerald-700" /> Materiaal mee te nemen
          </div>
          {alleMateriaal.length === 0 ? (
            <p className="text-sm text-stone-500">Geen taken gepland vandaag.</p>
          ) : (
            <ul className="space-y-1">
              {alleMateriaal.map((id) => (
                <li key={id} className="flex items-center gap-2 text-sm text-stone-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> {H.materiaal(id)}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <div className="text-sm font-semibold text-stone-900">Taken van vandaag</div>
          {mijnPlan.length === 0 && <p className="text-sm text-stone-500">Niets gepland.</p>}
          {mijnPlan.map((plan) => {
            const { wt, werf, tt, materiaal } = H.info(plan);
            const gestopt = st.gestopt.includes(plan.id);
            const actief = st.actiefPlanId === plan.id;
            const rapport = data.rapporten.filter((r) => r.planId === plan.id);
            const eerderGewerkt = data.events.filter(
              (e) => e.type === "taak_stop" && e.werftaakId === wt?.id && e.datum < dag
            ).length;
            return (
              <div
                key={plan.id}
                className={`rounded-2xl border p-4 shadow-sm ${
                  actief ? "border-emerald-600 bg-emerald-50" : gestopt ? "border-stone-200 bg-stone-100" : "border-stone-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className={`font-semibold ${gestopt ? "text-stone-400" : "text-stone-900"}`}>{tt?.naam}</div>
                    <div className="text-sm text-stone-500">
                      {werf?.klant} ·{" "}
                      <a href={mapsLink(werf?.adres)} target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline underline-offset-2">
                        {werf?.adres}
                      </a>
                    </div>
                    {(plan.medewerkerIds ?? []).length > 1 && (
                      <div className="text-xs text-stone-400">
                        Samen met {plan.medewerkerIds.filter((id) => id !== ik.id).map((id) => H.medewerker(id)?.naam).join(", ")}
                      </div>
                    )}
                  </div>
                  {wt?.meerdaags && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      meerdaags
                    </span>
                  )}
                </div>

                {eerderGewerkt > 0 && (
                  <p className="mt-2 text-xs text-stone-500">Al {eerderGewerkt} dag(en) aan gewerkt.</p>
                )}
                {wt?.opmerking && <p className="mt-2 text-sm text-stone-600">{wt.opmerking}</p>}

                <div className="mt-2 flex flex-wrap gap-1">
                  {materiaal.map((id) => (
                    <span key={id} className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">{H.materiaal(id)}</span>
                  ))}
                </div>

                {rapport.map((r) => (
                  <div key={r.id} className="mt-3 rounded-xl bg-white p-3 text-sm text-stone-700 ring-1 ring-stone-200">
                    <div className="mb-1 text-xs font-medium text-stone-500">
                      {klok(r.ts)} · {r.afgewerkt ? "afgewerkt" : "gestopt voor vandaag"}
                    </div>
                    {r.tekst && <p>{r.tekst}</p>}
                    {r.fotos?.length > 0 && (
                      <div className="mt-2 flex gap-2 overflow-x-auto">
                        {r.fotos.map((f, i) => (
                          <img key={i} src={f} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </section>

        {evs.length > 0 && (
          <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-stone-900">
              <Clock size={16} className="text-emerald-700" /> Registratie van vandaag
            </div>
            <ul className="space-y-1 text-sm text-stone-600">
              {evs.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="w-12 shrink-0 font-mono text-xs text-stone-400">{klok(e.ts)}</span>
                  <span>{eventTekst(e, H, data)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {actie && !afronden && (
        <div className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white p-4">
          <div className="mx-auto max-w-md">
            {actie.bestemming?.adres && (
              <a
                href={mapsLink(actie.bestemming.adres)}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-2 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-emerald-700 bg-white px-6 py-4 text-base font-semibold text-emerald-800 hover:bg-emerald-50"
              >
                <Navigation size={20} /> Route naar {actie.bestemming.adres}
              </a>
            )}
            <button
              onClick={actie.fn}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-6 py-5 text-lg font-semibold text-white hover:bg-emerald-800"
            >
              <actie.icon size={22} /> {actie.label}
            </button>
            {fout && <p className="mt-2 text-center text-xs text-red-600">{fout}</p>}
          </div>
        </div>
      )}

      {st.dagEinde && !actie && (
        <div className="fixed inset-x-0 bottom-0 bg-stone-900 p-4 text-center text-sm text-white">
          Dag afgesloten. Tot morgen, {ik.naam}.
        </div>
      )}

      {afronden && (
        <AfrondScherm
          plan={afronden}
          ik={ik}
          data={data}
          bewaar={bewaar}
          H={H}
          dag={dag}
          sluit={() => setAfronden(null)}
        />
      )}
    </div>
  );
}

/* ---------- taak afsluiten: klaar of morgen verder, met notitie en foto's ---------- */
function AfrondScherm({ plan, ik, data, bewaar, H, dag, sluit }) {
  const { wt, tt, werf } = H.info(plan);
  const [tekst, setTekst] = useState("");
  const [fotos, setFotos] = useState([]);
  const [bezig, setBezig] = useState(false);
  const input = useRef(null);

  const kiesFotos = async (files) => {
    setBezig(true);
    const nieuw = [];
    for (const f of Array.from(files).slice(0, 4)) {
      try { nieuw.push(await verkleinFoto(f)); } catch { /* sla over */ }
    }
    setFotos((s) => [...s, ...nieuw].slice(0, 6));
    setBezig(false);
  };

  const magAfsluiten = fotos.length > 0 && !bezig;

  const sluitAf = async (afgewerkt) => {
    if (!magAfsluiten) return;
    const ts = new Date().toISOString();
    await bewaar({
      ...data,
      events: [
        ...data.events,
        { id: uid(), ts, medewerkerId: ik.id, datum: dag, type: "taak_stop", planId: plan.id, werftaakId: wt.id, afgewerkt },
      ],
      rapporten: [
        ...data.rapporten,
        { id: uid(), ts, planId: plan.id, werftaakId: wt.id, medewerkerId: ik.id, tekst: tekst.trim(), fotos, afgewerkt },
      ],
      werftaken: data.werftaken.map((w) =>
        w.id !== wt.id ? w : { ...w, status: afgewerkt ? "klaar" : "bezig" }
      ),
    });
    sluit();
  };

  return (
    <div className="fixed inset-0 z-10 flex items-end bg-stone-900 bg-opacity-50 sm:items-center sm:justify-center">
      <div className="max-h-full w-full overflow-y-auto rounded-t-3xl bg-white p-5 sm:max-w-md sm:rounded-3xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="text-lg font-bold text-stone-900">{tt?.naam}</div>
            <div className="text-sm text-stone-500">{werf?.klant}</div>
          </div>
          <button onClick={sluit} className="rounded-full p-1 text-stone-400 hover:bg-stone-100"><X size={20} /></button>
        </div>

        <label className="mb-1 block text-sm font-medium text-stone-700">Wat is er gebeurd?</label>
        <textarea
          value={tekst}
          onChange={(e) => setTekst(e.target.value)}
          rows={3}
          placeholder="Notitie voor het kantoor…"
          className="mb-3 w-full rounded-xl border border-stone-300 p-3 text-sm"
        />

        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-medium text-stone-700">Foto's</span>
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">verplicht</span>
          </div>
          <div className="mb-2 flex flex-wrap gap-2">
            {fotos.map((f, i) => (
              <div key={i} className="relative">
                <img src={f} alt="" className="h-20 w-20 rounded-xl object-cover" />
                <button
                  onClick={() => setFotos(fotos.filter((_, j) => j !== i))}
                  className="absolute -right-1 -top-1 rounded-full bg-stone-900 p-1 text-white"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <button
              onClick={() => input.current?.click()}
              className={`flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed ${
                fotos.length === 0
                  ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                  : "border-stone-300 text-stone-500 hover:border-emerald-600 hover:text-emerald-700"
              }`}
            >
              <Camera size={20} />
              <span className="text-xs">Foto</span>
            </button>
          </div>
          <input
            ref={input}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={(e) => kiesFotos(e.target.files)}
            className="hidden"
          />
          {bezig && <p className="text-xs text-stone-500">Foto's worden verkleind…</p>}
          {!bezig && fotos.length === 0 && (
            <p className="text-xs text-stone-500">Neem minstens één foto van het resultaat voor je de taak afsluit.</p>
          )}
        </div>

        <div className="space-y-2">
          <button
            onClick={() => sluitAf(true)}
            disabled={!magAfsluiten}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-6 py-4 text-base font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400"
          >
            <Check size={20} /> Taak is volledig klaar
          </button>
          {wt?.meerdaags && (
            <button
              onClick={() => sluitAf(false)}
              disabled={!magAfsluiten}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-stone-300 bg-white px-6 py-4 text-base font-semibold text-stone-800 hover:bg-stone-50 disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-400"
            >
              <PauseCircle size={20} /> Stoppen voor vandaag, later verder
            </button>
          )}
          {!wt?.meerdaags && (
            <button
              onClick={() => sluitAf(false)}
              disabled={!magAfsluiten}
              className="w-full rounded-2xl px-6 py-3 text-sm font-medium text-stone-500 hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-300"
            >
              Stoppen voor vandaag zonder af te werken
            </button>
          )}
          {!magAfsluiten && (
            <p className="text-center text-xs font-medium text-stone-500">
              Voeg eerst een foto toe om de taak te kunnen afsluiten.
            </p>
          )}
        </div>
        <p className="mt-3 text-center text-xs text-stone-400">
          Daarna kan je gewoon verder: vertrekken naar de volgende werf of naar het atelier.
        </p>
      </div>
    </div>
  );
}

function eventTekst(e, H, data) {
  const naam = (id) => H.werf(id)?.klant ?? id;
  const plan = data.planning.find((p) => p.id === e.planId);
  const tt = plan ? H.taaktype(H.werftaak(plan.werftaakId)?.taaktypeId)?.naam : "";
  switch (e.type) {
    case "dag_start": return "Dag gestart op atelier";
    case "vertrek": return `Vertrokken naar ${naam(e.naar)}`;
    case "aankomst": return `Aangekomen bij ${naam(e.naar)}`;
    case "taak_stop": return e.afgewerkt ? `Taak afgewerkt: ${tt}` : `Taak gepauzeerd: ${tt}`;
    case "dag_einde": return "Dag afgesloten";
    default: return e.type;
  }
}

/* ================= KANTOOR ================= */
function KantoorApp({ data, bewaar, datum, setDatum, H, fout, terug }) {
  const [tab, setTab] = useState("week");
  const tabs = [
    { id: "week", label: "Week", icon: CalendarDays },
    { id: "dag", label: "Dagplanning", icon: Plus },
    { id: "werven", label: "Werven & taken", icon: ListChecks },
    { id: "opvolging", label: "Opvolging", icon: Clock },
    { id: "materiaal", label: "Materiaal", icon: Wrench },
    { id: "instellingen", label: "Instellingen", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-stone-50 font-sans">
      <header className="flex items-center gap-3 bg-stone-900 p-4 text-white">
        <button onClick={terug} className="rounded-full p-1 hover:bg-stone-800"><ChevronLeft size={20} /></button>
        <div className="text-lg font-bold">Kantoor</div>
        <input
          type="date"
          value={datum}
          onChange={(e) => setDatum(e.target.value)}
          className="ml-auto rounded-lg bg-stone-800 px-3 py-1.5 text-sm text-white"
        />
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-stone-200 bg-white px-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-3 text-sm font-medium ${
              tab === t.id ? "border-b-2 border-emerald-700 text-emerald-800" : "text-stone-500"
            }`}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </nav>

      <main className="mx-auto max-w-4xl p-4">
        {fout && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{fout}</p>}
        {tab === "week" && <WeekOverzicht {...{ data, datum, setDatum, H, naarDag: () => setTab("dag") }} />}
        {tab === "dag" && <Dagplanning {...{ data, bewaar, datum, H }} />}
        {tab === "werven" && <WerfBeheer {...{ data, bewaar, H }} />}
        {tab === "opvolging" && <Opvolging {...{ data, datum, H }} />}
        {tab === "materiaal" && <MateriaalBeheer {...{ data, bewaar }} />}
        {tab === "instellingen" && <Rijtijden {...{ data, bewaar, datum }} />}
      </main>
    </div>
  );
}

/* ---------- Week ---------- */
function WeekOverzicht({ data, datum, setDatum, H, naarDag }) {
  const maandag = maandagVan(datum);
  const dagen = [0, 1, 2, 3, 4, 5, 6].map((n) => plusDagen(maandag, n));
  const aantal = data.planning.filter((p) => dagen.includes(p.datum)).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
        <button onClick={() => setDatum(plusDagen(maandag, -7))} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100"><ChevronLeft size={18} /></button>
        <div className="text-center">
          <div className="text-sm font-semibold text-stone-900">Week van {dagLabel(maandag)}</div>
          <div className="text-xs text-stone-500">{aantal} taken gepland</div>
        </div>
        <button onClick={() => setDatum(plusDagen(maandag, 7))} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100"><ChevronRight size={18} /></button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {dagen.map((d) => {
          const dagPlan = data.planning.filter((p) => p.datum === d);
          const isVandaag = d === vandaag();
          return (
            <section key={d} className={`rounded-2xl border bg-white p-3 shadow-sm ${isVandaag ? "border-emerald-600" : "border-stone-200"}`}>
              <button onClick={() => { setDatum(d); naarDag(); }} className="mb-2 flex w-full items-baseline justify-between text-left">
                <span className={`text-sm font-semibold ${isVandaag ? "text-emerald-800" : "text-stone-900"}`}>{dagLabel(d)}</span>
                <span className="text-xs text-stone-400">bewerken</span>
              </button>

              {data.medewerkers.map((p) => {
                const zijn = dagPlan.filter((x) => (x.medewerkerIds ?? []).includes(p.id));
                const uur = H.startuur(p.id, d);
                if (zijn.length === 0 && !uur) return null;
                return (
                  <div key={p.id} className="mb-2 last:mb-0">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-medium text-stone-700">{p.naam}</span>
                      {uur && <span className="font-mono text-xs text-stone-400">{uur}</span>}
                    </div>
                    <ul className="mt-1 space-y-1">
                      {zijn.map((plan) => {
                        const { wt, werf, tt } = H.info(plan);
                        return (
                          <li key={plan.id} className="rounded-lg bg-stone-50 px-2 py-1.5 text-xs">
                            <div className="font-medium text-stone-800">
                              {tt?.naam}
                              {wt?.meerdaags && <span className="ml-1 text-amber-700">↻</span>}
                            </div>
                            <div className="text-stone-500">{werf?.klant}</div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
              {dagPlan.length === 0 && <p className="text-xs text-stone-400">Vrij</p>}
            </section>
          );
        })}
      </div>
      <p className="text-xs text-stone-400">↻ = meerdaagse taak</p>
    </div>
  );
}

/* ---------- Dagplanning: werftaken toewijzen aan een dag ---------- */
function Dagplanning({ data, bewaar, datum, H }) {
  const [werfId, setWerfId] = useState("");
  const [werftaakId, setWerftaakId] = useState("");
  const [medIds, setMedIds] = useState([]);

  const dagPlan = data.planning.filter((p) => p.datum === datum);
  const beschikbaar = data.werftaken.filter(
    (wt) => wt.werfId === werfId && wt.status !== "klaar" && !dagPlan.some((p) => p.werftaakId === wt.id)
  );

  const plan = () => {
    if (!werftaakId || medIds.length === 0) return;
    bewaar({
      ...data,
      planning: [...data.planning, { id: uid(), werftaakId, datum, medewerkerIds: medIds }],
    });
    setWerftaakId("");
    setMedIds([]);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-1 text-sm font-semibold text-stone-900">Startuur op {dagLabel(datum)}</div>
        <p className="mb-3 text-xs text-stone-500">Het uur waarop de medewerker op het atelier wordt verwacht.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {data.medewerkers.map((p) => {
            const huidig = data.starturen?.[startuurKey(datum, p.id)] ?? "";
            const zet = (uur) =>
              bewaar({ ...data, starturen: { ...(data.starturen ?? {}), [startuurKey(datum, p.id)]: uur } });
            return (
              <div key={p.id} className="rounded-xl bg-stone-50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-stone-800">{p.naam}</span>
                  <select
                    value={huidig}
                    onChange={(e) => zet(e.target.value)}
                    className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm font-medium"
                  >
                    <option value="">Geen startuur</option>
                    {STARTUREN.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="flex flex-wrap gap-1">
                  {SNELSTART.map((u) => (
                    <button
                      key={u}
                      onClick={() => zet(huidig === u ? "" : u)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                        huidig === u ? "bg-emerald-700 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100"
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <button
          onClick={() => {
            const uur = data.starturen?.[startuurKey(datum, data.medewerkers[0]?.id)] ?? "";
            if (!uur) return;
            const next = { ...(data.starturen ?? {}) };
            data.medewerkers.forEach((p) => { next[startuurKey(datum, p.id)] = uur; });
            bewaar({ ...data, starturen: next });
          }}
          className="mt-3 rounded-xl px-3 py-1.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-700 hover:bg-emerald-50"
        >
          Iedereen hetzelfde uur als {data.medewerkers[0]?.naam}
        </button>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-1 text-sm font-semibold text-stone-900">Taak inplannen op {dagLabel(datum)}</div>
        <p className="mb-3 text-xs text-stone-500">
          Je kiest uit de taken die op de werf openstaan. Een meerdaagse taak plan je gewoon op meerdere dagen in.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={werfId}
            onChange={(e) => { setWerfId(e.target.value); setWerftaakId(""); }}
            className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
          >
            <option value="">Werf…</option>
            {data.werven.map((w) => <option key={w.id} value={w.id}>{w.klant}</option>)}
          </select>
          <select
            value={werftaakId}
            onChange={(e) => setWerftaakId(e.target.value)}
            disabled={!werfId}
            className="rounded-xl border border-stone-300 px-3 py-2 text-sm disabled:bg-stone-100"
          >
            <option value="">{werfId ? "Openstaande taak…" : "Kies eerst een werf"}</option>
            {beschikbaar.map((wt) => (
              <option key={wt.id} value={wt.id}>
                {H.taaktype(wt.taaktypeId)?.naam}
                {wt.meerdaags ? " (meerdaags)" : ""}
                {wt.status === "bezig" ? " — bezig" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3">
          <div className="mb-1 text-xs font-medium text-stone-500">Wie voert dit uit? (meerdere mogelijk)</div>
          <div className="flex flex-wrap gap-1">
            {data.medewerkers.map((p) => {
              const aan = medIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => setMedIds(aan ? medIds.filter((x) => x !== p.id) : [...medIds, p.id])}
                  className={`rounded-full px-3 py-1.5 text-sm ${aan ? "bg-emerald-700 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}
                >
                  {p.naam}
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={plan}
          className="mt-3 flex items-center gap-1 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          <Plus size={16} /> Inplannen
        </button>
      </section>

      {data.medewerkers.map((p) => {
        const zijn = dagPlan.filter((x) => (x.medewerkerIds ?? []).includes(p.id));
        return (
          <section key={p.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-baseline justify-between">
              <div className="font-semibold text-stone-900">{p.naam}</div>
              <div className="text-xs text-stone-400">{H.startuur(p.id, datum) || "geen startuur"}</div>
            </div>
            {zijn.length === 0 && <p className="text-sm text-stone-400">Nog niets ingepland.</p>}
            <ul className="space-y-2">
              {zijn.map((plan) => {
                const { wt, werf, tt } = H.info(plan);
                return (
                  <li key={plan.id} className="flex items-center justify-between rounded-xl bg-stone-50 p-3">
                    <div>
                      <div className="text-sm font-medium text-stone-900">
                        {tt?.naam}
                        {wt?.meerdaags && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">meerdaags</span>}
                      </div>
                      <div className="text-xs text-stone-500">
                        {werf?.klant}
                        {(plan.medewerkerIds ?? []).length > 1 &&
                          ` · samen met ${plan.medewerkerIds.filter((id) => id !== p.id).map((id) => H.medewerker(id)?.naam).join(", ")}`}
                      </div>
                    </div>
                    <button
                      onClick={() => bewaar({ ...data, planning: data.planning.filter((x) => x.id !== plan.id) })}
                      className="rounded-lg p-2 text-stone-400 hover:bg-stone-200 hover:text-red-600"
                    >
                      <Trash2 size={15} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/* ---------- Werven & taken: het werfdossier ---------- */
function WerfBeheer({ data, bewaar, H }) {
  const [nieuweWerf, setNieuweWerf] = useState({ klant: "", adres: "" });
  const [open, setOpen] = useState(data.werven[0]?.id ?? null);
  const [nt, setNt] = useState({ taaktypeId: "", opmerking: "", meerdaags: false, extra: [] });

  const voegTaakToe = (werfId) => {
    if (!nt.taaktypeId) return;
    bewaar({
      ...data,
      werftaken: [...data.werftaken, { id: uid(), werfId, status: "open", ...nt }],
    });
    setNt({ taaktypeId: "", opmerking: "", meerdaags: false, extra: [] });
  };

  const statusKleur = {
    open: "bg-stone-100 text-stone-600",
    bezig: "bg-amber-100 text-amber-800",
    klaar: "bg-emerald-100 text-emerald-800",
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-stone-500">
        Hier leg je per werf vast wat er allemaal moet gebeuren. Die lijst blijft staan tot een taak afgewerkt is; in de dagplanning kies je eruit.
      </p>

      {data.werven.map((w) => {
        const taken = data.werftaken.filter((t) => t.werfId === w.id);
        const isOpen = open === w.id;
        const klaar = taken.filter((t) => t.status === "klaar").length;
        return (
          <section key={w.id} className="rounded-2xl border border-stone-200 bg-white shadow-sm">
            <button onClick={() => setOpen(isOpen ? null : w.id)} className="flex w-full items-center justify-between p-4 text-left">
              <div>
                <div className="font-semibold text-stone-900">{w.klant}</div>
                <div className="text-xs text-stone-500">{w.adres}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-stone-400">{klaar}/{taken.length} klaar</span>
                {isOpen ? <ChevronLeft size={18} className="rotate-90 text-stone-400" /> : <ChevronRight size={18} className="text-stone-400" />}
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-stone-100 p-4">
                <ul className="mb-4 space-y-2">
                  {taken.length === 0 && <p className="text-sm text-stone-400">Nog geen taken op deze werf.</p>}
                  {taken.map((t) => {
                    const gepland = data.planning.filter((p) => p.werftaakId === t.id);
                    return (
                      <li key={t.id} className="rounded-xl bg-stone-50 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-stone-900">{H.taaktype(t.taaktypeId)?.naam}</span>
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusKleur[t.status]}`}>{t.status}</span>
                              {t.meerdaags && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">meerdaags</span>}
                            </div>
                            {t.opmerking && <p className="mt-1 text-xs text-stone-600">{t.opmerking}</p>}
                            <p className="mt-1 text-xs text-stone-400">
                              {gepland.length === 0
                                ? "Nog niet ingepland"
                                : `Ingepland op ${gepland.map((p) => dagLabel(p.datum)).join(", ")}`}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            {t.status !== "klaar" && (
                              <button
                                onClick={() => bewaar({ ...data, werftaken: data.werftaken.map((x) => x.id === t.id ? { ...x, status: "klaar" } : x) })}
                                className="rounded-lg p-2 text-stone-400 hover:bg-stone-200 hover:text-emerald-700"
                                title="Manueel afvinken"
                              >
                                <Check size={15} />
                              </button>
                            )}
                            <button
                              onClick={() => bewaar({
                                ...data,
                                werftaken: data.werftaken.filter((x) => x.id !== t.id),
                                planning: data.planning.filter((p) => p.werftaakId !== t.id),
                              })}
                              className="rounded-lg p-2 text-stone-400 hover:bg-stone-200 hover:text-red-600"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="rounded-xl border border-dashed border-stone-300 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Taak toevoegen aan deze werf</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select
                      value={nt.taaktypeId}
                      onChange={(e) => setNt({ ...nt, taaktypeId: e.target.value })}
                      className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
                    >
                      <option value="">Taaktype…</option>
                      {data.taaktypes.map((tt) => <option key={tt.id} value={tt.id}>{tt.naam}</option>)}
                    </select>
                    <input
                      value={nt.opmerking}
                      onChange={(e) => setNt({ ...nt, opmerking: e.target.value })}
                      placeholder="Opmerking (optioneel)"
                      className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="mt-2">
                    <div className="mb-1 text-xs text-stone-500">Extra materiaal voor deze werf (bovenop het standaardmateriaal)</div>
                    <div className="flex flex-wrap gap-1">
                      {data.materialen.map((m) => {
                        const aan = nt.extra.includes(m.id);
                        return (
                          <button
                            key={m.id}
                            onClick={() => setNt({ ...nt, extra: aan ? nt.extra.filter((x) => x !== m.id) : [...nt.extra, m.id] })}
                            className={`rounded-full px-3 py-1 text-xs ${aan ? "bg-emerald-700 text-white" : "bg-stone-100 text-stone-500 hover:bg-stone-200"}`}
                          >
                            {m.naam}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-sm text-stone-700">
                    <input
                      type="checkbox"
                      checked={nt.meerdaags}
                      onChange={(e) => setNt({ ...nt, meerdaags: e.target.checked })}
                      className="h-4 w-4 rounded border-stone-300"
                    />
                    Deze taak duurt meerdere dagen
                  </label>
                  <button
                    onClick={() => voegTaakToe(w.id)}
                    className="mt-3 flex items-center gap-1 rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white"
                  >
                    <Plus size={15} /> Taak toevoegen
                  </button>
                </div>
              </div>
            )}
          </section>
        );
      })}

      <section className="rounded-2xl border border-dashed border-stone-300 bg-white p-4">
        <div className="mb-3 text-sm font-semibold text-stone-900">Nieuwe werf</div>
        <div className="grid gap-2 sm:grid-cols-3">
          <input value={nieuweWerf.klant} onChange={(e) => setNieuweWerf({ ...nieuweWerf, klant: e.target.value })} placeholder="Klant" className="rounded-xl border border-stone-300 px-3 py-2 text-sm" />
          <input value={nieuweWerf.adres} onChange={(e) => setNieuweWerf({ ...nieuweWerf, adres: e.target.value })} placeholder="Straat, nr, postcode, gemeente" className="rounded-xl border border-stone-300 px-3 py-2 text-sm" />
          <button
            onClick={() => {
              if (!nieuweWerf.klant.trim()) return;
              const id = uid();
              bewaar({ ...data, werven: [...data.werven, { id, ...nieuweWerf }] });
              setNieuweWerf({ klant: "", adres: "" });
              setOpen(id);
            }}
            className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Werf toevoegen
          </button>
        </div>
      </section>
    </div>
  );
}

/* ---------- Opvolging ---------- */
function Opvolging({ data, datum, H }) {
  return (
    <div className="space-y-5">
      {data.medewerkers.map((p) => {
        const evs = H.eventsVan(p.id, datum);
        const st = dagStatus(evs);
        const ritten = verplaatsingen(evs, data.rijtijden);
        const dagPlan = H.planVan(p.id, datum);
        const dagStart = evs.find((e) => e.type === "dag_start");
        const terug = [...evs].reverse().find((e) => e.type === "aankomst" && e.naar === ATELIER);
        const gepland = H.startuur(p.id, datum);
        const echt = dagStart ? new Date(dagStart.ts) : null;
        const verschil =
          echt && minutenNaMiddernacht(gepland) != null
            ? echt.getHours() * 60 + echt.getMinutes() - minutenNaMiddernacht(gepland)
            : null;

        return (
          <section key={p.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div className="font-semibold text-stone-900">{p.naam}</div>
              <div className="text-xs text-stone-500">
                {!dagStart && (gepland ? `Gepland ${gepland} · nog niet gestart` : "Nog niet gestart")}
                {dagStart && (
                  <span className={verschil != null && verschil > 10 ? "text-amber-700" : ""}>
                    Start {klok(dagStart.ts)}
                    {gepland && ` (gepland ${gepland}${verschil > 10 ? `, ${Math.round(verschil)} min later` : ""})`}
                  </span>
                )}
                {terug && ` · terug op atelier ${klok(terug.ts)}`}
                {st.dagEinde && " · dag afgesloten"}
              </div>
            </div>

            {dagPlan.length === 0 && <p className="text-sm text-stone-400">Geen taken op deze dag.</p>}

            <ul className="space-y-2">
              {dagPlan.map((plan) => {
                const { wt, werf, tt } = H.info(plan);
                const start = evs.find((e) => e.type === "aankomst" && e.planId === plan.id);
                const stop = evs.find((e) => e.type === "taak_stop" && e.planId === plan.id);
                const gewerkt = start && stop ? minutenTussen(start.ts, stop.ts) : null;
                const raming = tt?.standaardDuur ?? null;
                const rapporten = data.rapporten.filter((r) => r.planId === plan.id);
                return (
                  <li key={plan.id} className="rounded-xl bg-stone-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-stone-900">
                          {tt?.naam}
                          {stop && !stop.afgewerkt && (
                            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">verder op een andere dag</span>
                          )}
                          {stop?.afgewerkt && (
                            <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">afgewerkt</span>
                          )}
                        </div>
                        <div className="text-xs text-stone-500">
                          {werf?.klant}
                          {start && ` · ${klok(start.ts)}`}{stop && `–${klok(stop.ts)}`}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={`text-sm font-semibold ${gewerkt && raming && !wt?.meerdaags && gewerkt > raming * 1.25 ? "text-amber-700" : "text-stone-900"}`}>
                          {gewerkt == null ? (start ? "bezig" : "—") : duur(gewerkt)}
                        </div>
                        <div className="text-xs text-stone-400">raming {duur(raming)}</div>
                      </div>
                    </div>

                    {rapporten.map((r) => (
                      <div key={r.id} className="mt-2 border-t border-stone-200 pt-2">
                        {r.tekst && <p className="text-sm text-stone-700">{r.tekst}</p>}
                        {r.fotos?.length > 0 && (
                          <div className="mt-2 flex gap-2 overflow-x-auto">
                            {r.fotos.map((f, i) => (
                              <a key={i} href={f} target="_blank" rel="noopener noreferrer">
                                <img src={f} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </li>
                );
              })}
            </ul>

            {ritten.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
                  <Truck size={14} /> Verplaatsingen
                </div>
                <ul className="space-y-2">
                  {ritten.map((r, i) => (
                    <li key={i} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl p-3 text-sm ${r.teLang ? "bg-amber-50 text-amber-900" : "bg-stone-50 text-stone-700"}`}>
                      <span className="flex items-center gap-2">
                        {r.teLang && <AlertTriangle size={15} className="text-amber-600" />}
                        {H.werf(r.van)?.klant} → {H.werf(r.naar)?.klant}
                        <span className="text-xs text-stone-500">({klok(r.start)}–{klok(r.eind)})</span>
                      </span>
                      <span className="font-medium">
                        {duur(r.werkelijk)} <span className="text-xs font-normal text-stone-500">/ normaal {duur(r.norm)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ---------- Materiaal & taaktypes ---------- */
function MateriaalBeheer({ data, bewaar }) {
  const [nieuwMat, setNieuwMat] = useState("");
  const [nieuwType, setNieuwType] = useState({ naam: "", standaardDuur: 60, materiaalIds: [] });

  const toggleBestaand = (typeId, matId) =>
    bewaar({
      ...data,
      taaktypes: data.taaktypes.map((t) =>
        t.id !== typeId
          ? t
          : { ...t, materiaalIds: t.materiaalIds.includes(matId) ? t.materiaalIds.filter((x) => x !== matId) : [...t.materiaalIds, matId] }
      ),
    });

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-stone-900">Materiaal</div>
        <div className="mb-3 flex flex-wrap gap-1">
          {data.materialen.map((m) => (
            <span key={m.id} className="flex items-center gap-1 rounded-full bg-stone-100 px-3 py-1 text-sm text-stone-700">
              {m.naam}
              <button
                onClick={() => bewaar({
                  ...data,
                  materialen: data.materialen.filter((x) => x.id !== m.id),
                  taaktypes: data.taaktypes.map((t) => ({ ...t, materiaalIds: t.materiaalIds.filter((x) => x !== m.id) })),
                  werftaken: data.werftaken.map((w) => ({ ...w, extra: (w.extra ?? []).filter((x) => x !== m.id) })),
                })}
                className="text-stone-400 hover:text-red-600"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={nieuwMat}
            onChange={(e) => setNieuwMat(e.target.value)}
            placeholder="Nieuw materiaal, bv. Verticuteermachine"
            className="min-w-0 flex-1 rounded-xl border border-stone-300 px-3 py-2 text-sm"
          />
          <button
            onClick={() => {
              if (!nieuwMat.trim()) return;
              bewaar({ ...data, materialen: [...data.materialen, { id: uid(), naam: nieuwMat.trim() }] });
              setNieuwMat("");
            }}
            className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Toevoegen
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="text-sm font-semibold text-stone-900">Taaktypes — hier ligt het standaardmateriaal vast</div>
        {data.taaktypes.map((t) => (
          <div key={t.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="font-medium text-stone-900">{t.naam}</div>
                <div className="text-xs text-stone-500">Raming {duur(t.standaardDuur)}</div>
              </div>
              <button
                onClick={() => bewaar({ ...data, taaktypes: data.taaktypes.filter((x) => x.id !== t.id) })}
                className="rounded-lg p-2 text-stone-400 hover:text-red-600"
              >
                <Trash2 size={15} />
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {data.materialen.map((m) => {
                const aan = t.materiaalIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleBestaand(t.id, m.id)}
                    className={`rounded-full px-3 py-1 text-xs ${aan ? "bg-emerald-700 text-white" : "bg-stone-100 text-stone-500 hover:bg-stone-200"}`}
                  >
                    {m.naam}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-dashed border-stone-300 bg-white p-4">
        <div className="mb-3 text-sm font-semibold text-stone-900">Nieuw taaktype</div>
        <div className="mb-2 grid gap-2 sm:grid-cols-2">
          <input
            value={nieuwType.naam}
            onChange={(e) => setNieuwType({ ...nieuwType, naam: e.target.value })}
            placeholder="Naam, bv. Snoeien fruitbomen"
            className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            value={nieuwType.standaardDuur}
            onChange={(e) => setNieuwType({ ...nieuwType, standaardDuur: Number(e.target.value) })}
            placeholder="Raming in minuten"
            className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="mb-3 flex flex-wrap gap-1">
          {data.materialen.map((m) => {
            const aan = nieuwType.materiaalIds.includes(m.id);
            return (
              <button
                key={m.id}
                onClick={() => setNieuwType({
                  ...nieuwType,
                  materiaalIds: aan ? nieuwType.materiaalIds.filter((x) => x !== m.id) : [...nieuwType.materiaalIds, m.id],
                })}
                className={`rounded-full px-3 py-1 text-xs ${aan ? "bg-emerald-700 text-white" : "bg-stone-100 text-stone-500"}`}
              >
                {m.naam}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => {
            if (!nieuwType.naam.trim()) return;
            bewaar({ ...data, taaktypes: [...data.taaktypes, { id: uid(), ...nieuwType, naam: nieuwType.naam.trim() }] });
            setNieuwType({ naam: "", standaardDuur: 60, materiaalIds: [] });
          }}
          className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          Taaktype bewaren
        </button>
      </section>
    </div>
  );
}

/* ---------- registraties van één dag wissen (om te testen) ---------- */
function resetDag(data, dag) {
  const events = data.events.filter((e) => e.datum !== dag);
  const planIdsVanDag = data.planning.filter((p) => p.datum === dag).map((p) => p.id);
  const rapporten = data.rapporten.filter((r) => !planIdsVanDag.includes(r.planId));
  // status van elke werftaak opnieuw afleiden uit wat er overblijft
  const werftaken = data.werftaken.map((wt) => {
    const stops = events.filter((e) => e.type === "taak_stop" && e.werftaakId === wt.id);
    const status = stops.some((e) => e.afgewerkt) ? "klaar" : stops.length > 0 ? "bezig" : "open";
    return { ...wt, status };
  });
  return { ...data, events, rapporten, werftaken };
}

/* ---------- Atelier & rijtijden ---------- */
function Rijtijden({ data, bewaar, datum }) {
  const [bevestig, setBevestig] = useState(null);
  const plaatsen = [{ id: ATELIER, klant: "Atelier" }, ...data.werven];
  const koppels = useMemo(() => {
    const out = [];
    for (let i = 0; i < plaatsen.length; i++)
      for (let j = i + 1; j < plaatsen.length; j++) out.push([plaatsen[i], plaatsen[j]]);
    return out;
  }, [data.werven]);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-1 text-sm font-semibold text-stone-900">Atelier</div>
        <p className="mb-2 text-xs text-stone-500">Vertrekpunt van de dag en bestemming van de terugrit.</p>
        <input
          value={data.atelier?.adres ?? ""}
          onChange={(e) => bewaar({ ...data, atelier: { klant: "Atelier", adres: e.target.value } })}
          placeholder="Adres van het atelier"
          className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
        />
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-1 text-sm font-semibold text-stone-900">Normale rijtijden (minuten)</div>
        <p className="mb-3 text-xs text-stone-500">
          Hierop draait het alarm: duurt een verplaatsing langer dan de normale tijd + 50% (minstens 10 min extra), dan kleurt ze oranje in Opvolging.
        </p>
        <ul className="space-y-2">
          {koppels.map(([a, b]) => (
            <li key={paar(a.id, b.id)} className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 p-3">
              <span className="text-sm text-stone-700">{a.klant} ↔ {b.klant}</span>
              <input
                type="number"
                value={data.rijtijden[paar(a.id, b.id)] ?? ""}
                onChange={(e) => bewaar({ ...data, rijtijden: { ...data.rijtijden, [paar(a.id, b.id)]: Number(e.target.value) || 0 } })}
                className="w-20 rounded-lg border border-stone-300 px-2 py-1 text-right text-sm"
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-1 text-sm font-semibold text-stone-900">Testen</div>
        <p className="mb-3 text-xs text-stone-500">
          Wist de registraties zodat je de dag opnieuw kan doorlopen. De planning zelf blijft staan.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setBevestig("dag")}
            className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800"
          >
            Registraties van vandaag wissen
          </button>
          <button
            onClick={() => setBevestig("alles")}
            className="rounded-xl px-4 py-2 text-sm font-medium text-stone-600 ring-1 ring-stone-300 hover:bg-stone-100"
          >
            Alles terugzetten naar demodata
          </button>
        </div>

        {bevestig === "dag" && (
          <div className="mt-3 rounded-xl bg-amber-50 p-3">
            <p className="mb-2 text-sm text-amber-900">
              Alle start-, rij- en stopuren van vandaag verdwijnen, samen met de notities en foto's van vandaag. Taken springen terug naar hun vorige status.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { bewaar(resetDag(data, vandaag())); setBevestig(null); }}
                className="rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white"
              >
                Ja, wissen
              </button>
              <button onClick={() => setBevestig(null)} className="rounded-xl px-4 py-2 text-sm text-stone-600">Annuleren</button>
            </div>
          </div>
        )}

        {bevestig === "alles" && (
          <div className="mt-3 rounded-xl bg-red-50 p-3">
            <p className="mb-2 text-sm text-red-900">
              Alles gaat terug naar de originele demodata: werven, taken, planning, registraties, foto's. Je eigen aanpassingen zijn dan weg.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { bewaar(seed()); setBevestig(null); }}
                className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white"
              >
                Ja, alles terugzetten
              </button>
              <button onClick={() => setBevestig(null)} className="rounded-xl px-4 py-2 text-sm text-stone-600">Annuleren</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
