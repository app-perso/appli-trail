// Résumé à coller dans l'app Claude pour discuter librement de l'adaptation du plan.
// Il n'est envoyé nulle part par l'appli : c'est toi qui le copies et le colles.
import type { CoachDecision, Race } from '../db/types';
import { kmEffort } from './calc';
import { addDays, mondayOf, sleepMinutes } from './dates';
import { formatDuration } from './format';
import { currentRatio, recentSeries, type Data } from './coach';
import type { Proposal } from './adapt';
import { describe } from './adapt';

export function claudeBrief(d: Data, races: Race[], props: Proposal[], decisions: CoachDecision[], today: string, hr: { rest: number; max: number }): string {
  const L: string[] = [];
  const nextRaces = races.filter((r) => r.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  L.push("Tu es mon coach de trail. Ta priorité : m'éviter les blessures (genou et cheville fragiles), puis me préparer au mieux.");
  L.push("Règles de prudence que je suis : couloir de sécurité (volume hebdo ≤ moyenne des 3 semaines précédentes + 15 %), 1 semaine allégée sur 4, ratio de charge 7 j / 28 j entre 0,8 et 1,3, D− sur 2 jours ≤ 2 000 m, douleur 3-4 ou encore là au réveil → séance suivante sans D+ ou vélo, douleur ≥ 5 → arrêt et kiné.");
  L.push("Regarde mes données ci-dessous, dis-moi ce que tu en penses et propose des adaptations concrètes de mes prochaines séances (jour, durée, km, D+, intensité). Pose-moi des questions si besoin.");
  L.push('');
  L.push(`## Profil (aujourd'hui : ${today})`);
  L.push(`- FC repos ${hr.rest}, FC max ${hr.max}. km-effort = km + D+/100.`);
  for (const r of nextRaces) L.push(`- Course : ${r.name}, ${r.date}, ${r.distanceKm} km / ${r.elevationGain} m D+${r.goalTime ? `, objectif ${r.goalTime}` : ''}${r.isMain ? ' (objectif principal)' : ''}`);

  const ratio = currentRatio(d, today);
  const series = recentSeries(d, today, 6);
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

  L.push('', '## Plan des 14 prochains jours');
  const done = new Set(d.activities.map((a) => a.plannedSessionId));
  for (const s of d.sessions.filter((s) => s.date >= today && s.date < addDays(today, 14) && !done.has(s.id)).sort((a, b) => a.date.localeCompare(b.date))) {
    L.push(`- ${s.date} ${s.isKey ? '⭐ ' : ''}${describe(s)}${s.intensity ? `, ${s.intensity}` : ''}${s.instructions ? ` — consignes : ${s.instructions.replace(/\s+/g, ' ').slice(0, 220)}` : ''}`);
  }

  if (props.length || decisions.length) {
    L.push('', "## Ce que le coach de l'appli propose / ce que j'ai décidé");
    for (const p of props) L.push(`- Proposé : ${p.title} — ${p.reason}`);
    for (const x of decisions.filter((x) => x.decidedAt > addDays(today, -14)))
      L.push(`- ${x.decision === 'accepted' ? (x.undone ? 'Accepté puis annulé' : 'Accepté') : 'Refusé'} : ${x.title}${x.option ? ` (${x.option})` : ''}`);
  }
  return L.join('\n');
}
