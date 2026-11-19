// Résumé à coller dans l'app Claude pour discuter librement de l'adaptation du plan.
// Il n'est envoyé nulle part par l'appli : c'est toi qui le copies et le colles.
import type { CoachDecision, JournalEntry, Race, Sleep } from '../db/types';
import type { Profile } from './profile';
import { R, isPersonal, RULE_LABELS, type Rules } from './rules';
import { FOOT_TYPES } from './week';
import { REPLY_FORMAT } from './claudeReply';
import { kmEffort } from './calc';
import { addDays, mondayOf, sleepMinutes } from './dates';
import { formatDuration } from './format';
import { currentRatio, recentSeries, type Data } from './coach';
import type { Proposal } from './adapt';
import { describe } from './adapt';

export interface BriefExtra {
  profile?: Profile;
  journal?: JournalEntry[];
  sleeps?: Sleep[];
}

export function claudeBrief(d: Data, races: Race[], props: Proposal[], decisions: CoachDecision[], today: string, hr: { rest: number; max: number }, x: BriefExtra = {}): string {
  const L: string[] = [];
  const nextRaces = races.filter((r) => r.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  L.push("Tu es mon coach de trail. Ta priorité : m'éviter les blessures (genou et cheville fragiles), puis me préparer au mieux.");
  const r = R();
  L.push(`Règles de prudence en vigueur dans mon appli : couloir de sécurité (volume hebdo ≤ moyenne des ${r.couloir_semaines} semaines précédentes + ${r.couloir_hausse_pct} %), 1 semaine allégée sur ${r.semaine_allegee_toutes_les}, ratio de charge 7 j / 28 j : attention au-dessus de ${r.ratio_attention}, risque au-dessus de ${r.ratio_risque}, D− sur 2 jours ≤ ${r.dmoins_2j_max_m} m, nuit < ${r.sommeil_min_h} h → séance allégée, douleur ${r.douleur_adapter}-${r.douleur_stop - 1} encore là au réveil → séance suivante sans D+ ou vélo, douleur ≥ ${r.douleur_stop} → arrêt et kiné.`);
  const perso = (Object.keys(RULE_LABELS) as (keyof Rules)[]).filter(isPersonal);
  if (perso.length) L.push(`Seuils personnalisés par l'appli d'après mon historique (plus prudents que la règle générale) : ${perso.map((k) => `${RULE_LABELS[k]} = ${r[k]}`).join(', ')}.`);
  L.push("Ce dossier contient TOUT mon historique résumé, ce que l'appli a appris sur moi et la mémoire de nos décisions passées : appuie-toi dessus. Dis-moi ce que tu en penses, pose-moi des questions si besoin, et propose des adaptations concrètes.");
  L.push('');
  L.push(`## Profil (aujourd'hui : ${today})`);
  L.push(`- FC repos ${hr.rest}, FC max ${hr.max}. km-effort = km + D+/100.`);
  for (const r of nextRaces) L.push(`- Course : ${r.name}, ${r.date}, ${r.distanceKm} km / ${r.elevationGain} m D+${r.goalTime ? `, objectif ${r.goalTime}` : ''}${r.isMain ? ' (objectif principal)' : ''}`);

  const ratio = currentRatio(d, today);
  const series = recentSeries(d, today, 6);
  // Ce que l'appli a appris
  if (x.profile) {
    L.push('', "## Ce que l'appli a appris sur moi (calculé sur tout mon historique)");
    for (const i of x.profile.insights) L.push(`- [${i.confidence}, ${i.n} cas] ${i.title}. ${i.text}${i.effect ? ` → ${i.effect}` : ''}`);
    for (const l of x.profile.learning) L.push(`- (pas encore assez de données) ${l.title} : ${l.need}`);
  }

  // Historique complet, semaine par semaine
  const acts = d.activities.filter((a) => !a.skipped && a.date <= today);
  const first = [...acts.map((a) => a.date), ...d.checkIns.map((c) => c.date)].sort()[0];
  if (first) {
    L.push('', '## Historique complet, semaine par semaine (à pied : course + rando)');
    L.push('Colonnes : semaine du lundi | séances | km | D+ m | D− m | km-effort | RPE moyen | forme moyenne /10 | sommeil moyen | douleur max');
    const sleepOf = new Map<string, number>();
    for (const sl of x.sleeps ?? []) if (sl.hours) sleepOf.set(sl.date, sl.hours);
    for (const c of d.checkIns) if (c.bedTime && c.wakeTime) sleepOf.set(c.date, sleepMinutes(c.bedTime, c.wakeTime) / 60);
    for (let m = mondayOf(first); m <= mondayOf(today); m = addDays(m, 7)) {
      const inW = (date: string) => date >= m && date <= addDays(m, 6);
      const wa = acts.filter((a) => inW(a.date));
      const foot = wa.filter((a) => FOOT_TYPES.includes(a.type));
      const wc = d.checkIns.filter((c) => inW(c.date));
      const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '-');
      const km = foot.reduce((t, a) => t + a.distanceKm, 0);
      const dp = foot.reduce((t, a) => t + a.elevationGain, 0);
      const dm = foot.every((a) => a.elevationLoss !== undefined) && foot.length ? String(Math.round(foot.reduce((t, a) => t + (a.elevationLoss ?? 0), 0))) : '?';
      const pains = [...wa.flatMap((a) => a.pains), ...wc.flatMap((c) => c.pains)].filter((p) => p.score > 0);
      const worst = pains.sort((a, b) => b.score - a.score)[0];
      const sl = [...sleepOf.entries()].filter(([dd]) => inW(dd)).map(([, h]) => h);
      L.push(
        `- ${m} | ${wa.length} | ${km.toFixed(1)} | ${Math.round(dp)} | ${dm} | ${kmEffort(km, dp).toFixed(0)} | ${avg(wa.map((a) => a.rpe).filter((v): v is number => v !== undefined))} | ${avg(wc.map((c) => c.forme).filter((v): v is number => v !== undefined))} | ${sl.length ? avg(sl) + ' h' : '-'} | ${worst ? `${worst.zone} ${worst.score}/10` : '-'}`,
      );
    }
    const painLog = [...acts.flatMap((a) => a.pains.map((p) => ({ date: a.date, ...p, src: 'séance' }))), ...d.checkIns.flatMap((c) => c.pains.map((p) => ({ date: c.date, ...p, src: 'réveil' })))]
      .filter((p) => p.score >= 2)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (painLog.length) {
      L.push('', '## Toutes mes douleurs notées (≥ 2/10)');
      for (const p of painLog) L.push(`- ${p.date} : ${p.zone} ${p.score}/10 (${p.src})`);
    }
  }

  // Mémoire : journal du coach (plans, décisions prises avec Claude, enseignements)
  if (x.journal?.length) {
    L.push('', '## Mémoire : journal du coach (décisions et enseignements passés)');
    for (const j of [...x.journal].sort((a, b) => a.date.localeCompare(b.date)).slice(-40)) L.push(`- ${j.date}${j.categorie ? ` [${j.categorie}]` : ''} : ${j.texte}`);
  }

  L.push('', '## Charge');
  L.push(`- Ratio de charge actuel : ${ratio.ratio !== undefined ? ratio.ratio.toFixed(2) + ` (${ratio.zone})` : 'non calculable'}`);
  for (const w of series.filter((x) => x.monday <= mondayOf(today))) {
    const t = w.totals;
    L.push(`- Semaine du ${w.monday}${w.label ? ` (${w.label}${w.phase ? ', ' + w.phase : ''})` : ''} : ${w.unknown ? 'pas de débrief' : `${t.doneKm.toFixed(1)} km / ${Math.round(t.doneDPlus)} m D+ faits`} sur ${t.plannedKm.toFixed(1)} km / ${Math.round(t.plannedDPlus)} m prévus${w.ceiling.km ? `, plafond couloir ${w.ceiling.km.toFixed(0)} km` : ''}`);
  }

  L.push('', '## Check-ins des 14 derniers jours');
  for (const c of d.checkIns.filter((c) => c.date > addDays(today, -14)).sort((a, b) => a.date.localeCompare(b.date))) {
    const pains = c.pains.filter((p) => p.score > 0).map((p) => `${p.zone} ${p.score}/10`).join(', ');
    L.push(`- ${c.date} : sommeil ${c.bedTime && c.wakeTime ? formatDuration(sleepMinutes(c.bedTime, c.wakeTime)) + ', ' : ''}qualité ${c.sleepQuality ?? '?'}/5, forme ${c.forme ?? '?'}/10${c.moral !== undefined ? `, moral ${c.moral}/10` : ''}${pains ? `, douleurs : ${pains}` : ''}`);
  }

  L.push('', '## Séances des 14 derniers jours');
  const planById = new Map(d.sessions.map((s) => [s.id, s]));
  for (const a of d.activities.filter((a) => a.date > addDays(today, -14) && a.date <= today).sort((x, y) => x.date.localeCompare(y.date))) {
    const s = a.plannedSessionId ? planById.get(a.plannedSessionId) : undefined;
    if (a.skipped) {
      L.push(`- ${a.date} ${s?.title ?? a.type} : PAS FAITE${a.note ? ` (« ${a.note} »)` : ''}`);
      continue;
    }
    const f = a.feelings;
    const feel = [f.plaisir !== undefined && `plaisir ${f.plaisir}`, f.fatigue !== undefined && `fatigue ${f.fatigue}`, f.moral !== undefined && `moral ${f.moral}`, f.estomac !== undefined && `estomac ${f.estomac}`].filter(Boolean).join(', ');
    const pains = a.pains.filter((p) => p.score > 0).map((p) => `${p.zone} ${p.score}/10`).join(', ');
    L.push(
      `- ${a.date} ${s?.title ?? a.type} (${a.type}) : ${formatDuration(a.durationMin)}, ${a.distanceKm} km, +${a.elevationGain}${a.elevationLoss !== undefined ? ` / −${a.elevationLoss}` : ''} m, km-effort ${kmEffort(a.distanceKm, a.elevationGain).toFixed(0)}${a.hrAvg ? `, FC ${a.hrAvg}/${a.hrMax ?? '?'}` : ''}${a.rpe ? `, RPE ${a.rpe}` : ''}${a.vamUp ? `, VAM montée ${a.vamUp} m/h` : ''}${a.vamDown ? `, descente ${a.vamDown} m/h` : ''}${a.vo2max ? `, VO2max ${a.vo2max}` : ''}${a.recoveryHours ? `, récup ${a.recoveryHours} h` : ''}${feel ? `, ressentis (0-10) : ${feel}` : ''}${pains ? `, douleurs : ${pains}` : ''}${a.note ? ` — « ${a.note} »` : ''}`,
    );
  }

  L.push('', '## Plan des 21 prochains jours (date | titre exact | détail)');
  const done = new Set(d.activities.map((a) => a.plannedSessionId));
  for (const s of d.sessions.filter((s) => s.date >= today && s.date < addDays(today, 21) && !done.has(s.id)).sort((a, b) => a.date.localeCompare(b.date))) {
    L.push(`- ${s.date} | ${s.title} | ${s.isKey ? 'séance clé, ' : ''}${s.type}${s.durationMin ? `, ${formatDuration(s.durationMin)}` : ''}${s.distanceKm ? `, ${s.distanceKm} km` : ''}${s.elevationGain ? `, ${s.elevationGain} m D+` : ''}${s.intensity ? `, ${s.intensity}` : ''}${s.instructions ? ` — consignes : ${s.instructions.replace(/\s+/g, ' ').slice(0, 200)}` : ''}`);
  }
  void describe;

  if (props.length || decisions.length) {
    L.push('', "## Ce que le coach de l'appli propose / ce que j'ai décidé");
    for (const p of props) L.push(`- Proposé : ${p.title} — ${p.reason}`);
    for (const x of decisions.filter((x) => x.decidedAt > addDays(today, -14)))
      L.push(`- ${x.decision === 'accepted' ? (x.undone ? 'Accepté puis annulé' : 'Accepté') : 'Refusé'} : ${x.title}${x.option ? ` (${x.option})` : ''}`);
  }
  L.push('', "## Comment me répondre pour que mon appli applique nos décisions");
  L.push("Discutons d'abord librement. Quand nous sommes d'accord (ou si je te demande « le bloc pour l'appli »), termine ta réponse par UN bloc ```json``` au format suivant. Je le colle dans l'appli, qui me montre l'avant → après avant d'appliquer. N'invente pas de séances passées : on ne modifie que les séances à venir (date ≥ aujourd'hui).");
  L.push('```json');
  L.push(
    JSON.stringify(
      {
        format: REPLY_FORMAT,
        resume: 'Une phrase : ce qu’on a décidé et pourquoi',
        modifications: [
          { action: 'modifier', date: 'AAAA-MM-JJ', seance: 'début du titre exact (si plusieurs séances ce jour-là)', km: 8, dplus: 150, duree_min: 50, intensite: 'Z1-Z2', description: 'consignes', titre: 'nouveau titre (optionnel)' },
          { action: 'deplacer', date: 'AAAA-MM-JJ', seance: '…', vers: 'AAAA-MM-JJ' },
          { action: 'supprimer', date: 'AAAA-MM-JJ', seance: '…' },
          { action: 'ajouter', date: 'AAAA-MM-JJ', type: 'course | trail | rando | velo | renfo | repos', titre: '…', km: 6, dplus: 0, duree_min: 40, intensite: 'Z1', description: '…', cle: false },
        ],
        enseignements: [{ texte: 'Ce qu’on a appris sur moi et qu’il faut retenir pour la suite (ex. mon genou n’aime pas 2 jours de descente d’affilée)', categorie: 'blessure | charge | sommeil | récupération | course | autre' }],
      },
      null,
      2,
    ),
  );
  L.push('```');
  L.push("Règles du bloc : mets seulement les champs à changer ; « enseignements » sert de mémoire (ils reviendront dans mes prochains dossiers), n'y mets que ce qui est durable. Pour refaire tout le plan des semaines à venir, donne plutôt un fichier plan au format « appli-trail-plan » (je te donnerai PLAN_FORMAT.md si besoin).");
  return L.join('\n');
}
