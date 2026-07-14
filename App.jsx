/**
 * Instapbestand.
 *
 * Dit vervangt het "kies je naam"-scherm van het prototype door een echte
 * aanmelding, en laadt de gegevens uit Supabase in plaats van window.storage.
 *
 * TE DOEN bij het overzetten van het prototype:
 *  1. Kopieer uit tuinplanner.jsx alles ONDER de login: MedewerkerScherm,
 *     AfrondScherm, KantoorApp, WeekOverzicht, Dagplanning, WerfBeheer,
 *     Opvolging, MateriaalBeheer, Rijtijden + de helpers bovenaan
 *     (klok, duur, mapsLink, dagStatus, verplaatsingen, verkleinFoto, …).
 *     Zet ze in src/components/ en importeer ze hieronder.
 *  2. Vervang in die schermen elke aanroep van `bewaar(...)` en `voegEvent(...)`
 *     door de overeenkomstige functie uit src/lib/db.js, gevolgd door herlaad().
 *  3. De vorm van het `data`-object is identiek gebleven, dus de rest van de
 *     code (H.info, dagStatus, verplaatsingen, …) blijft werken zoals ze is.
 */
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { laadAlles } from "./db";
import Login from "./components/Login";
// import MedewerkerScherm from "./components/MedewerkerScherm";
// import KantoorApp from "./components/KantoorApp";

export default function App() {
  const [sessie, setSessie] = useState(undefined); // undefined = nog aan het kijken
  const [data, setData] = useState(null);
  const [ikBenKantoor, setIkBenKantoor] = useState(false);
  const [alsMedewerker, setAlsMedewerker] = useState(false);
  const [fout, setFout] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessie(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSessie(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const herlaad = async () => {
    try {
      const d = await laadAlles();
      setData(d);
      const ik = d.medewerkers.find((m) => m.id === sessie.user.id);
      setIkBenKantoor(ik?.rol === "kantoor");
      setFout(null);
    } catch (e) {
      setFout("De gegevens konden niet geladen worden. Controleer je verbinding.");
    }
  };

  useEffect(() => {
    if (sessie) herlaad();
  }, [sessie]);

  if (sessie === undefined) return <div className="p-8 text-center text-stone-500">Even geduld…</div>;
  if (!sessie) return <Login />;
  if (fout) return <div className="p-8 text-center text-red-600">{fout}</div>;
  if (!data) return <div className="p-8 text-center text-stone-500">Planning laden…</div>;

  const ik = data.medewerkers.find((m) => m.id === sessie.user.id);

  /* Olivier is kantoor én medewerker: hij kan wisselen tussen beide schermen. */
  const toonMedewerker = !ikBenKantoor || alsMedewerker;

  return (
    <>
      {ikBenKantoor && (
        <div className="flex justify-between bg-stone-900 px-4 py-2 text-sm text-white">
          <button onClick={() => setAlsMedewerker(!alsMedewerker)} className="underline">
            {alsMedewerker ? "Naar kantoorscherm" : "Naar mijn eigen dag"}
          </button>
          <button onClick={() => supabase.auth.signOut()} className="text-stone-400 underline">
            Afmelden
          </button>
        </div>
      )}

      {/* Hier komen de schermen uit het prototype.
          Ze krijgen `data`, `ik` en `herlaad` in plaats van `bewaar`.

          {toonMedewerker
            ? <MedewerkerScherm ik={ik} data={data} herlaad={herlaad} />
            : <KantoorApp data={data} herlaad={herlaad} />} */}

      <pre className="p-4 text-xs text-stone-500">
        Aangemeld als {ik?.naam} ({ik?.rol}). {data.planning.length} taken in de planning.
      </pre>
    </>
  );
}
