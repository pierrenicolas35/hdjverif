// @vitest-environment happy-dom
/**
 * Test d'intégration UI ↔ moteur.
 *
 * Charge le markup réel de `index.html`, importe le module d'interface et
 * vérifie que le panneau de résultat reflète la décision du moteur, y compris
 * lors du chargement d'un cas de démonstration.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

function extraireBody(): string {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
  const corps = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? '';
  return corps.replace(/<script[\s\S]*?<\/script>/gi, '');
}

function texte(id: string): string {
  return document.getElementById(id)?.textContent?.trim() ?? '';
}

describe('Interface — intégration du moteur décisionnel', () => {
  beforeAll(async () => {
    document.body.innerHTML = extraireBody();
    await import('../src/ui/main.ts');
  });

  it('monte les 5 blocs du formulaire dynamique', () => {
    expect(document.getElementById('id_sejour')).not.toBeNull();
    expect(document.getElementById('zone-intervenants')).not.toBeNull();
    expect(document.getElementById('zone-actes')).not.toBeNull();
    expect(document.getElementById('zone-medicaments')).not.toBeNull();
    expect(document.getElementById('surveillance_active_documentee')).not.toBeNull();
  });

  it('affiche la décision VALIDE_GHS pour le cas de démonstration par défaut', () => {
    expect(texte('badge-statut')).toBe('VALIDE_GHS');
    expect(document.getElementById('badge')?.className).toContain('VERT');
  });

  it('affiche les 5 portes de la pyramide décisionnelle', () => {
    const portes = document.querySelectorAll('#zone-portes li');
    expect(portes).toHaveLength(5);
  });

  it('rend les trois piliers de densité', () => {
    expect(document.querySelectorAll('#zone-piliers .pilier')).toHaveLength(3);
  });

  it('passe en REJET_VERS_FORFAIT_SEANCE au chargement du cas chimiothérapie', () => {
    const presets = document.querySelectorAll<HTMLElement>('[data-action="charger-preset"]');
    expect(presets.length).toBeGreaterThanOrEqual(5);

    presets[4]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(texte('badge-statut')).toBe('REJET_VERS_FORFAIT_SEANCE');
    expect(document.getElementById('badge')?.className).toContain('ROUGE');
    expect(texte('zone-motifs')).toContain('forfait de séance');
  });

  it('revalide en temps réel après modification d’une case à cocher', () => {
    const presets = document.querySelectorAll<HTMLElement>('[data-action="charger-preset"]');
    presets[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(texte('badge-statut')).toBe('VALIDE_GHS');

    // Décoche la synthèse médicale → suspension.
    const synthese = document.getElementById('synthese_medicale_tracee');
    if (!(synthese instanceof HTMLInputElement)) throw new Error('case absente');
    synthese.checked = false;
    synthese.dispatchEvent(new Event('change', { bubbles: true }));

    expect(texte('badge-statut')).toBe('SUSPENDU_POUR_REGULARISATION');
    expect(document.getElementById('badge')?.className).toContain('ORANGE');
  });

  it('ajoute puis supprime une ligne d’intervenant', () => {
    const avant = document.querySelectorAll('[data-array="intervenants"]').length;
    const boutonAjout = document.querySelector<HTMLElement>(
      '[data-action="ajouter-intervenant"]',
    );
    boutonAjout?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.querySelectorAll('[data-array="intervenants"]').length).toBe(avant + 1);

    const supprimer = document.querySelectorAll<HTMLElement>(
      '[data-action="supprimer-intervenant"]',
    );
    supprimer[supprimer.length - 1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.querySelectorAll('[data-array="intervenants"]').length).toBe(avant);
  });

  it('expose les références normatives dans les constats', () => {
    expect(texte('zone-constats')).toContain('DGOS/R1/DSS/1A/2020/52');
  });
});
