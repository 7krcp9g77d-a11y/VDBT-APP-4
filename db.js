/**
 * Datalaag — dit vervangt window.storage uit het prototype.
 *
 * laadAlles() geeft exact dezelfde structuur terug als het `data`-object
 * in het prototype, zodat de bestaande schermen amper moeten wijzigen.
 * Schrijven gebeurt niet meer als één grote blob, maar per actie.
 */
import { supabase } from "./supabase";

const check = ({ data, error }) => {
  if (error) throw error;
  return data;
};

/* ---------------- LEZEN ---------------- */
export async function laadAlles() {
  const [
    profiles, materialen, taaktypes, ttMat, werven, werftaken, wtMat,
    planning, planMed, starturen, rijtijden, instellingen, events, rapporten, fotos,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("actief", true).then(check),
    supabase.from("materialen").select("*").then(check),
    supabase.from("taaktypes").select("*").then(check),
    supabase.from("taaktype_materiaal").select("*").then(check),
    supabase.from("werven").select("*").eq("actief", true).then(check),
    supabase.from("werftaken").select("*").then(check),
    supabase.from("werftaak_materiaal").select("*").then(check),
    supabase.from("planning").select("*").then(check),
    supabase.from("planning_medewerkers").select("*").then(check),
    supabase.from("starturen").select("*").then(check),
    supabase.from("rijtijden").select("*").then(check),
    supabase.from("instellingen").select("*").then(check),
    supabase.from("events").select("*").then(check),
    supabase.from("rapporten").select("*").then(check),
    supabase.from("rapport_fotos").select("*").then(check),
  ]);

  const fotoUrl = (pad) =>
    supabase.storage.from("werffotos").getPublicUrl(pad).data.publicUrl;

  return {
    medewerkers: profiles.map((p) => ({ id: p.id, naam: p.naam, rol: p.rol })),
    materialen,
    taaktypes: taaktypes.map((t) => ({
      id: t.id,
      naam: t.naam,
      standaardDuur: t.standaard_duur,
      materiaalIds: ttMat.filter((x) => x.taaktype_id === t.id).map((x) => x.materiaal_id),
    })),
    werven,
    werftaken: werftaken.map((w) => ({
      id: w.id,
      werfId: w.werf_id,
      taaktypeId: w.taaktype_id,
      opmerking: w.opmerking,
      meerdaags: w.meerdaags,
      status: w.status,
      extra: wtMat.filter((x) => x.werftaak_id === w.id).map((x) => x.materiaal_id),
    })),
    planning: planning.map((p) => ({
      id: p.id,
      werftaakId: p.werftaak_id,
      datum: p.datum,
      medewerkerIds: planMed.filter((x) => x.planning_id === p.id).map((x) => x.medewerker_id),
    })),
    starturen: Object.fromEntries(
      starturen.map((s) => [`${s.datum}|${s.medewerker_id}`, s.uur.slice(0, 5)])
    ),
    rijtijden: Object.fromEntries(
      rijtijden.map((r) => [[r.van, r.naar].sort().join("~"), r.minuten])
    ),
    atelier: instellingen.find((i) => i.sleutel === "atelier")?.waarde ?? { klant: "Atelier", adres: "" },
    events: events.map((e) => ({
      id: e.id,
      medewerkerId: e.medewerker_id,
      datum: e.datum,
      ts: e.ts,
      type: e.type,
      van: e.van,
      naar: e.naar,
      planId: e.planning_id,
      werftaakId: e.werftaak_id,
      afgewerkt: e.afgewerkt,
    })),
    rapporten: rapporten.map((r) => ({
      id: r.id,
      planId: r.planning_id,
      werftaakId: r.werftaak_id,
      medewerkerId: r.medewerker_id,
      ts: r.ts,
      tekst: r.tekst,
      afgewerkt: r.afgewerkt,
      fotos: fotos.filter((f) => f.rapport_id === r.id).map((f) => fotoUrl(f.pad)),
    })),
  };
}

/* ---------------- REGISTRATIES (medewerker) ---------------- */

/** Vervangt voegEvent() uit het prototype. */
export async function schrijfEvent(e) {
  const { data: { user } } = await supabase.auth.getUser();
  return supabase.from("events").insert({
    medewerker_id: user.id,
    datum: e.datum,
    type: e.type,
    van: e.van ?? null,
    naar: e.naar ?? null,
    planning_id: e.planId ?? null,
    werftaak_id: e.werftaakId ?? null,
    afgewerkt: e.afgewerkt ?? null,
  }).select().single().then(check);
}

/**
 * Taak afsluiten: event + rapport + foto's + nieuwe status van de werftaak.
 * `fotos` zijn dataURL's uit verkleinFoto().
 */
export async function sluitTaakAf({ plan, werftaakId, datum, tekst, fotos, afgewerkt }) {
  const { data: { user } } = await supabase.auth.getUser();

  await schrijfEvent({ datum, type: "taak_stop", planId: plan.id, werftaakId, afgewerkt });

  const rapport = await supabase.from("rapporten").insert({
    planning_id: plan.id,
    werftaak_id: werftaakId,
    medewerker_id: user.id,
    tekst,
    afgewerkt,
  }).select().single().then(check);

  for (const [i, dataUrl] of fotos.entries()) {
    const blob = await (await fetch(dataUrl)).blob();
    const pad = `${werftaakId}/${rapport.id}-${i}.jpg`;
    const { error } = await supabase.storage
      .from("werffotos")
      .upload(pad, blob, { contentType: "image/jpeg", upsert: true });
    if (error) throw error;
    await supabase.from("rapport_fotos").insert({ rapport_id: rapport.id, pad }).then(check);
  }

  await supabase.from("werftaken")
    .update({ status: afgewerkt ? "klaar" : "bezig" })
    .eq("id", werftaakId)
    .then(check);

  return rapport;
}

/* ---------------- PLANNING & BEHEER (kantoor) ---------------- */
export const planTaak = async ({ werftaakId, datum, medewerkerIds }) => {
  const plan = await supabase.from("planning")
    .insert({ werftaak_id: werftaakId, datum })
    .select().single().then(check);
  await supabase.from("planning_medewerkers")
    .insert(medewerkerIds.map((id) => ({ planning_id: plan.id, medewerker_id: id })))
    .then(check);
  return plan;
};

export const verwijderPlanning = (id) =>
  supabase.from("planning").delete().eq("id", id).then(check);

export const zetStartuur = (datum, medewerkerId, uur) =>
  uur
    ? supabase.from("starturen")
        .upsert({ datum, medewerker_id: medewerkerId, uur }, { onConflict: "datum,medewerker_id" })
        .then(check)
    : supabase.from("starturen")
        .delete().eq("datum", datum).eq("medewerker_id", medewerkerId)
        .then(check);

export const zetRijtijd = (van, naar, minuten) => {
  const [a, b] = [van, naar].sort();
  return supabase.from("rijtijden")
    .upsert({ van: a, naar: b, minuten }, { onConflict: "van,naar" })
    .then(check);
};

export const voegWerfToe = (klant, adres) =>
  supabase.from("werven").insert({ klant, adres }).select().single().then(check);

export const voegWerftaakToe = async ({ werfId, taaktypeId, opmerking, meerdaags, extra }) => {
  const wt = await supabase.from("werftaken")
    .insert({ werf_id: werfId, taaktype_id: taaktypeId, opmerking, meerdaags })
    .select().single().then(check);
  if (extra?.length) {
    await supabase.from("werftaak_materiaal")
      .insert(extra.map((m) => ({ werftaak_id: wt.id, materiaal_id: m })))
      .then(check);
  }
  return wt;
};

export const zetWerftaakStatus = (id, status) =>
  supabase.from("werftaken").update({ status }).eq("id", id).then(check);

export const voegMateriaalToe = (naam) =>
  supabase.from("materialen").insert({ naam }).select().single().then(check);

export const voegTaaktypeToe = async ({ naam, standaardDuur, materiaalIds }) => {
  const tt = await supabase.from("taaktypes")
    .insert({ naam, standaard_duur: standaardDuur })
    .select().single().then(check);
  if (materiaalIds?.length) {
    await supabase.from("taaktype_materiaal")
      .insert(materiaalIds.map((m) => ({ taaktype_id: tt.id, materiaal_id: m })))
      .then(check);
  }
  return tt;
};

export const koppelMateriaalAanTaaktype = (taaktypeId, materiaalId, aan) =>
  aan
    ? supabase.from("taaktype_materiaal").insert({ taaktype_id: taaktypeId, materiaal_id: materiaalId }).then(check)
    : supabase.from("taaktype_materiaal").delete()
        .eq("taaktype_id", taaktypeId).eq("materiaal_id", materiaalId).then(check);

export const zetAtelierAdres = (adres) =>
  supabase.from("instellingen")
    .upsert({ sleutel: "atelier", waarde: { klant: "Atelier", adres } })
    .then(check);
