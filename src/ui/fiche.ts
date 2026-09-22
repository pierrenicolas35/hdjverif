/**
 * Génération de la « Fiche de traçabilité T2A » : export texte et impression.
 *
 * La fiche reprend telle quelle la synthèse produite par le moteur
 * (`synthese_audit`), qui constitue le document opposable en contrôle.
 */

import { INSTRUCTION_DGOS_2020_52 } from '../core/rules-engine/index.js';
import type { DossierHDJ, ResultatAudit } from '../core/rules-engine/index.js';

/** Nom de fichier normalisé, dérivé de la décision rendue. */
export function nomFichier(resultat: ResultatAudit): string {
  const niveau = resultat.niveau_ghs ? `_${resultat.niveau_ghs}` : '';
  return `Fiche_T2A_HDJ_${resultat.statut}${niveau}.txt`;
}

/** Contenu texte complet de la fiche de traçabilité. */
export function contenuFiche(dossier: DossierHDJ, resultat: ResultatAudit): string {
  const entete = [
    'FICHE DE TRAÇABILITÉ T2A — ÉVALUATION HDJ (GHS) vs ACTES EXTERNES (ACE)',
    `Document généré le ${new Date().toLocaleString('fr-FR')}`,
    '',
    'OBJET : attester des éléments de traçabilité permettant de caractériser',
    "l'hospitalisation de jour, conformément à l'annexe 4, point 5, de l'instruction.",
    '',
  ].join('\n');

  const visa = [
    '',
    'VISA ET RESPONSABILITÉS',
    '  Rédacteur de l’évaluation : ______________________________  Date : ____/____/______',
    '  Validation DIM             : ______________________________  Date : ____/____/______',
    '  Médecin coordonnateur      : ______________________________  Date : ____/____/______',
    '',
    'DISPOSITIF DE RESCRIT TARIFAIRE (annexe 6)',
    "  En cas de divergence d'interprétation persistante sur les conditions de",
    "  facturation, l'établissement peut solliciter une prise de position formelle",
    "  de l'État et de l'Assurance Maladie (rescrit tarifaire).",
    '',
  ].join('\n');

  const pieces = [
    'PIÈCES JUSTIFICATIVES À MAINTENIR AU DOSSIER',
    `  [${dossier.est_programme ? 'x' : ' '}] Convocation programmée / objectif médical formalisé`,
    `  [${dossier.lettre_adressage_presente ? 'x' : ' '}] Demande médicale préalable (lettre d’adressage)`,
    `  [${dossier.synthese_medicale_tracee ? 'x' : ' '}] Compte-rendu d’hospitalisation ou lettre de sortie signé`,
    `  [${dossier.lettre_liaison_remise ? 'x' : ' '}] Lettre de liaison remise (art. R. 1112-1-2 CSP)`,
    `  [${dossier.surveillance_active_documentee ? 'x' : ' '}] Traçabilité de la surveillance active (constantes, tolérance)`,
    '  [ ] Notes d’évolution individualisées de chaque intervenant',
    '  [ ] Éléments de contexte patient / surveillance particulière',
    '',
  ].join('\n');

  const pied = [
    '',
    `Référence : Instruction N° ${INSTRUCTION_DGOS_2020_52.id} du ${INSTRUCTION_DGOS_2020_52.date}`,
    `NOR : ${INSTRUCTION_DGOS_2020_52.nor} — ${INSTRUCTION_DGOS_2020_52.publication}`,
    '',
    'Document d’aide à la décision médico-administrative. Il ne se substitue pas',
    'à l’appréciation du médecin DIM ni aux contrôles de l’Assurance Maladie.',
    '',
  ].join('\n');

  return `${entete}${resultat.synthese_audit}\n${pieces}${visa}${pied}`;
}

/** Téléchargement de la fiche au format texte. */
export function telechargerFiche(dossier: DossierHDJ, resultat: ResultatAudit): void {
  const blob = new Blob([contenuFiche(dossier, resultat)], {
    type: 'text/plain;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier(resultat);
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  URL.revokeObjectURL(url);
}

/** Échappement HTML minimal. */
function echapper(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Ouverture d'une fenêtre imprimable contenant la fiche complète. */
export function imprimerFiche(dossier: DossierHDJ, resultat: ResultatAudit): void {
  const fenetre = window.open('', '_blank', 'width=900,height=1000');
  if (!fenetre) {
    window.alert(
      'L’ouverture de la fenêtre d’impression a été bloquée par le navigateur. ' +
        'Autorisez les fenêtres surgissantes puis réessayez.',
    );
    return;
  }

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Fiche de traçabilité T2A — évaluation HDJ</title>
  <style>
    @page { size: A4; margin: 14mm; }
    body { font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; }
    h1 { font-size: 15pt; margin: 0 0 4px; }
    .meta { font-size: 9pt; color: #475569; margin-bottom: 12px; }
    pre { font-family: "SFMono-Regular", Consolas, monospace; font-size: 8.5pt;
          line-height: 1.35; white-space: pre-wrap; border: 1px solid #cbd5e1;
          border-radius: 6px; padding: 10px; }
    .visa { margin-top: 18px; font-size: 9pt; }
    button { padding: 8px 14px; border: 0; border-radius: 8px; cursor: pointer;
             background: #0284c7; color: #fff; font-weight: 600; margin-bottom: 12px; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <button onclick="window.print()">Imprimer / Enregistrer en PDF</button>
  <h1>Fiche de traçabilité T2A — Évaluation HDJ</h1>
  <div class="meta">
    Décision : <strong>${echapper(resultat.libelle_decision)}</strong>
  </div>
  <pre>${echapper(contenuFiche(dossier, resultat))}</pre>
</body>
</html>`;

  fenetre.document.open();
  fenetre.document.write(html);
  fenetre.document.close();
  fenetre.focus();
}
