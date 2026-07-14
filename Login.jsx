import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState(null);

  const meldAan = async () => {
    setBezig(true);
    setFout(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password: wachtwoord });
    if (error) setFout("Aanmelden lukte niet. Controleer je e-mailadres en wachtwoord.");
    setBezig(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 p-6 font-sans">
      <div className="w-full max-w-sm">
        <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-emerald-700">Tuinplanner</div>
        <h1 className="mb-6 text-3xl font-bold text-stone-900">Aanmelden</h1>

        <label className="mb-1 block text-sm font-medium text-stone-700">E-mailadres</label>
        <input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-xl border border-stone-300 px-4 py-3 text-base"
        />

        <label className="mb-1 block text-sm font-medium text-stone-700">Wachtwoord</label>
        <input
          type="password"
          autoComplete="current-password"
          value={wachtwoord}
          onChange={(e) => setWachtwoord(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && meldAan()}
          className="mb-5 w-full rounded-xl border border-stone-300 px-4 py-3 text-base"
        />

        <button
          onClick={meldAan}
          disabled={bezig || !email || !wachtwoord}
          className="w-full rounded-2xl bg-emerald-700 px-6 py-4 text-lg font-semibold text-white hover:bg-emerald-800 disabled:bg-stone-200 disabled:text-stone-400"
        >
          {bezig ? "Even geduld…" : "Aanmelden"}
        </button>

        {fout && <p className="mt-3 text-center text-sm text-red-600">{fout}</p>}
      </div>
    </div>
  );
}
