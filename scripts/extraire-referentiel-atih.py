#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extraction des référentiels ATIH (Manuel des GHM MCO et nomenclature CCAM).

    uv run --with pypdf python3 scripts/extraire-referentiel-atih.py
    uv run --with pypdf python3 scripts/extraire-referentiel-atih.py --sans-telechargement

POURQUOI CE SCRIPT EST EN PYTHON
    Les sources officielles de l'ATIH sont des **PDF**. La chaîne d'import de
    l'application (`scripts/import-referentiels.mjs`) est en Node et n'embarque aucun
    extracteur PDF : la conversion PDF → texte est donc faite ici, une fois, puis
    versionnée sous forme de CSV dans `data/`. Le reste du traitement (croisement avec
    la CCAM, classement HDJ) reste en Node, dans `scripts/lib/ghm.mjs`.

CE QUI EST PRODUIT
    data/atih/racines-ghm-2025.csv         679 racines de GHM et leur marqueur « GHM courts »
    data/atih/actes-classants-ghm-2025.csv 5 492 actes classants, leurs racines et leurs CMD
    data/ccam-complete-2025.csv            8 065 actes CCAM consolidés (chapitres 1 à 19)

SOURCES (toutes publiques)
    Manuel des GHM 2025, arrêté publié au BO du 23/07/2025 :
      https://www.atih.sante.fr/manuel-des-ghm-2025-publication-bo
        annexe 2  vol1an2.pdf   GHM classés par CMD (codes, libellés, catégorie majeure)
        annexe 3  vol1an3.pdf   caractéristiques des racines (colonne « GHM courts »)
        annexe 8  vol1an8.pdf   actes classants et CMD où ils sont répertoriés
        annexe 11 vol1an11.pdf  actes mineurs reclassant dans un GHM « médical »
        volume 2  vol2cmdNN.pdf  listes d'actes en CCAM rattachées à chaque racine
    Nomenclature CCAM descriptive, ATIH — chapitres 1 à 19 :
      https://www.atih.sante.fr/sites/default/files/public/content/1621/Chapitre_N.pdf
      (chapitres 1 à 9 en un chiffre, 10 à 19 en deux chiffres)

CONTRÔLES DE COHÉRENCE exécutés en fin de script : ils échouent bruyamment si une source
change de forme — c'est la raison d'être du script plutôt que d'un fichier figé.
"""

from __future__ import annotations

import argparse
import csv
import datetime
import glob
import os
import re
import sys
import unicodedata
from collections import Counter

BASE = "https://www.atih.sante.fr/sites/default/files/public/content"
GHM_DIR = ".cache/atih"
SORTIE_GHM = "data/atih"

ANNEXES = {
    "vol1an2": f"{BASE}/4962/vol1an2.pdf",
    "vol1an3": f"{BASE}/4962/vol1an3.pdf",
    "vol1an8": f"{BASE}/4962/vol1an8.pdf",
    "vol1an11": f"{BASE}/4962/vol1an11.pdf",
}
CMDS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14",
        "15", "16", "17", "18", "19", "20", "21", "22", "23", "25", "26", "27", "28", "90"]
CHAPITRES = list(range(1, 20))


# ----------------------------------------------------------------------
# Utilitaires
# ----------------------------------------------------------------------

def normaliser(texte: str) -> str:
    """Minuscules sans accent ni apostrophe typographique (comparaison de libellés)."""
    t = unicodedata.normalize("NFKD", texte)
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t.replace("\u2019", "'").replace('"', '"')).strip()


def entete(fichier, source: str, notes: list[str]) -> None:
    fichier.write(f"# {source}\n")
    fichier.write(f"# Extraites le {datetime.date.today().isoformat()} par "
                  "scripts/extraire-referentiel-atih.py : données officielles reprises telles quelles.\n")
    for n in notes:
        fichier.write(f"# {n}\n")


# ----------------------------------------------------------------------
# Conversion PDF → texte (mise en cache)
# ----------------------------------------------------------------------

def texte_pdf(chemin_pdf: str) -> str:
    txt = chemin_pdf.replace(".pdf", ".txt")
    if os.path.exists(txt) and os.path.getsize(txt) > 1000:
        return open(txt, encoding="utf-8").read()
    try:
        from pypdf import PdfReader
    except ImportError:
        sys.exit("pypdf est requis : uv run --with pypdf python3 scripts/extraire-referentiel-atih.py")
    lecteur = PdfReader(chemin_pdf)
    contenu = "\n".join((p.extract_text() or "") for p in lecteur.pages)
    open(txt, "w", encoding="utf-8").write(contenu)
    return contenu


def telecharger(url: str, chemin: str) -> None:
    if os.path.exists(chemin) and os.path.getsize(chemin) > 1024:
        return
    import urllib.request
    os.makedirs(os.path.dirname(chemin), exist_ok=True)
    requete = urllib.request.Request(url, headers={"User-Agent": "hdjverif-extraction/1.0"})
    with urllib.request.urlopen(requete, timeout=120) as r, open(chemin, "wb") as f:
        f.write(r.read())
    if os.path.getsize(chemin) < 1024:
        sys.exit(f"source tronquée : {url}")


# ----------------------------------------------------------------------
# 1. Annexe 2 — GHM classés par CMD : racines, libellés, catégorie majeure
# ----------------------------------------------------------------------

# Formes normalisées (accents retirés, casse d'origine) des intitulés de catégorie majeure.
CATEGORIES = {
    "Groupes chirurgicaux",
    "Groupes avec acte classant non operatoire",
    'Groupes "medicaux"',
    "Groupes indifferenties",
    "Erreurs et autres sejours inclassables",
}
GHM_LIGNE = re.compile(r"^(\d{2}[A-Z]\d{2}[A-Z0-9])\s+(.+)$")
CONNECTEURS = {"en", "de", "du", "des", "la", "le", "les", "et", "ou", "avec", "sans", "sur",
               "par", "pour", "au", "aux", "a", "d", "l", "un", "une"}


def lire_annexe2(contenu: str) -> dict:
    """Une entrée par code GHM (6 caractères) : CMD, catégorie majeure, libellé."""
    lignes = [l.rstrip() for l in contenu.split("\n")]
    ghms, cmd, categorie = {}, None, None
    for i, ligne in enumerate(lignes):
        s = ligne.strip()
        if not s:
            continue
        m = re.match(r"^CAT[EÉ]GORIE MAJEURE DE DIAGNOSTIC\s*:\s*(\d+)$", s)
        if m:
            cmd, categorie = m.group(1).zfill(2), None
            continue
        if normaliser(s) in CATEGORIES:
            # On conserve l'intitulé **officiel** (casse et accents d'origine) : c'est lui
            # que compare le moteur Node (`CATEGORIE_*` de scripts/lib/ghm.mjs).
            categorie = s
            continue
        m = GHM_LIGNE.match(s)
        if not (m and cmd):
            continue
        libelle = m.group(2).strip()
        # Recoller un libellé coupé en fin de ligne (la colonne est étroite dans le PDF).
        j = i + 1
        while libelle and (libelle.endswith((",", "("))
                          or libelle.split()[-1].lower().strip("'") in CONNECTEURS):
            suivant = lignes[j].strip() if j < len(lignes) else ""
            j += 1
            if (not suivant or GHM_LIGNE.match(suivant) or normaliser(suivant) in CATEGORIES
                    or re.match(r"^(CAT[EÉ]GORIE|GHM class|Groupes |Manuel des GHM|Annexe 2)", suivant)):
                break
            libelle = f"{libelle} {suivant}"
        ghms[m.group(1)] = {"cmd": cmd, "categorie": categorie,
                            "libelle": re.sub(r"\s+", " ", libelle).strip()}
    return ghms


def construire_racines(ghms: dict, courts: dict) -> dict:
    """Regroupe les GHM par racine (5 caractères) et rattache le marqueur « GHM courts »."""
    racines = {}
    for code, g in ghms.items():
        r = code[:5]
        e = racines.setdefault(r, {"racine": r, "cmd": g["cmd"], "categorie": g["categorie"],
                                   "libelle": None, "ghm_ambulatoire": False,
                                   "ghm_court": courts.get(r, "")})
        if g["categorie"] and not e["categorie"]:
            e["categorie"] = g["categorie"]
        if code[5] == "J":
            e["ghm_ambulatoire"] = True
            e["libelle"] = g["libelle"]        # le libellé de la version ambulatoire prime
        elif not e["libelle"]:
            e["libelle"] = g["libelle"]
    for e in racines.values():
        e["zero_nuit"] = e["ghm_court"] in ("J", "T0", "T1", "T2")
    return racines


def lire_ghm_courts(contenu: str) -> dict:
    """Colonne « GHM courts » de l'annexe 3 (J, T0, T1, T2)."""
    racine = re.compile(r"^(\d{2}[A-Z]\d{2})(?:\s|$)")
    court = re.compile(r"\b(J|T0|T1|T2)\b")
    courts = {}
    for ligne in contenu.split("\n"):
        s = ligne.strip()
        m = racine.match(s)
        if not m:
            continue
        c = court.search(s[len(m.group(1)):len(m.group(1)) + 40])
        if c:
            courts[m.group(1)] = c.group(1)
    return courts


# ----------------------------------------------------------------------
# 2. Annexe 8 et annexe 11
# ----------------------------------------------------------------------

def lire_annexe8(contenu: str) -> dict:
    """Acte CCAM → catégories majeures de diagnostic où il est classant."""
    motif = re.compile(r"^([A-Z]{4}\d{3})/(\d)\s+([\d\s]+)$")
    actes = {}
    for ligne in contenu.split("\n"):
        m = motif.match(ligne.strip())
        if m:
            actes.setdefault(m.group(1), set()).update(m.group(3).split())
    return {k: sorted(v) for k, v in actes.items()}


def lire_annexe11(contenu: str) -> set:
    """Actes mineurs reclassant dans un GHM « médical »."""
    motif = re.compile(r"^([A-Z]{4}\d{3})-\d{2}/\d")
    return {m.group(1) for ligne in contenu.split("\n") if (m := motif.match(ligne.strip()))}


# ----------------------------------------------------------------------
# 3. Volume 2 — rattachement des actes aux racines (via les listes « A-xxx »)
# ----------------------------------------------------------------------

HDR_RACINE = re.compile(r"^(\d{2}[A-Z]\d{2})([A-Z0-9])?\s+\S")
HDR_LISTE = re.compile(r"^Liste\s+([AD]-\d+)\s*:")
ACTE_SLASH = re.compile(r"([A-Z]{4}\d{3})\s*(?: ?-\d{2})?\s*/\s*(\d)?\s*(.*)")
ACTE_SEC = re.compile(r"^([A-Z]{4}\d{3})\s{2,}(.+)$")


def lire_volume2(chemins: list[str]) -> tuple[dict, dict, dict]:
    """Rend (racine → listes, liste → actes, liste → libellé)."""
    racine_listes, listes, libelles_liste = {}, {}, {}
    for chemin in chemins:
        courant = None
        for ligne in open(chemin, encoding="utf-8"):
            s = ligne.strip()
            if not s:
                continue
            m = HDR_RACINE.match(s)
            if m:
                courant = m.group(1)
                continue
            m = re.search(r"Voir la liste[s]?\s+(A-\d+)", s)
            if m and courant:
                racine_listes.setdefault(courant, set()).add(m.group(1))
    for chemin in chemins:
        liste = None
        for ligne in open(chemin, encoding="utf-8"):
            s = ligne.strip()
            m = HDR_LISTE.match(s)
            if m:
                liste = m.group(1) if m.group(1).startswith("A-") else None
                if liste:
                    listes.setdefault(liste, [])
                    libelles_liste.setdefault(liste, s.split(":", 1)[1].strip())
                continue
            if liste is None:
                continue
            trouve = False
            for m in ACTE_SLASH.finditer(s):
                listes[liste].append((m.group(1), (m.group(3) or "").strip()))
                trouve = True
            if not trouve and (m := ACTE_SEC.match(s)):
                listes[liste].append((m.group(1), m.group(2).strip()))
    return racine_listes, listes, libelles_liste


# ----------------------------------------------------------------------
# 4. Chapitres CCAM 1 à 19 — code, libellé, chapitre
# ----------------------------------------------------------------------

# Deux mises en page : « CODE P A Libellé » (actes simples) et « CODE Libellé » (actes à phases).
MOTIF_ACTE = re.compile(
    r"(?P<f>(?P<f1>[A-Z]{4}\d{3}) +[0-9](?: +[0-9])? +)"
    r"|(?P<p>(?:^|\n)[ ]*(?P<p1>[A-Z]{4}\d{3}) +(?=[A-ZÉÈÊÀÂÎÏÔÛÜÇ]))"
)
# Débuts de note de la CCAM, qui terminent le libellé.
NOTE = re.compile(
    r"(?:[ÀA] l'exclusion|Avec ou sans|Indication\s*:|Formation\s*:|Environnement\s*:"
    r"|Facturation\s*:|Recherche\s|Activité\s|Y compris|Ne peut|Peut être|Voir la liste"
    r"|Code\s|Sans contre-indication|Autres actes|Phase\s"
    r"|\[[A-Z]{4}\d{3}|\([A-Z0-9], )"
)


def nettoyer_libelle(brut: str) -> str:
    texte = re.sub(r"\s+", " ", brut).strip()
    m = NOTE.search(texte)
    if m:
        texte = texte[:m.start()].strip()
    # Pied de page du manuel (« 4 0 Activité 4 : anesthésie » → il reste « 4 0 »). Le motif
    # exige **deux** nombres : un libellé officiel peut légitimement finir par un chiffre
    # (« anesthésie générale ou locorégionale complémentaire niveau 1 »).
    texte = re.sub(r"\s+\d+\s+\d+$", "", texte)
    return texte.strip(" -–,;")


def lire_chapitres(dossier: str) -> tuple[dict, dict]:
    actes, titres = {}, {}
    for n in CHAPITRES:
        contenu = texte_pdf(os.path.join(dossier, f"ch{n}.txt").replace(".txt", ".pdf"))
        t = []
        for ligne in contenu.split("\n")[:15]:
            s = ligne.strip()
            if not s or s.isdigit():
                continue
            if re.match(r"^\d{2}\.\d{2}", s):
                break
            t.append(s)
        titres[n] = re.sub(r"\s+", " ", " ".join(t))
        occurrences = list(MOTIF_ACTE.finditer(contenu))
        for k, m in enumerate(occurrences):
            code = m.group("f1") or m.group("p1")
            fin = occurrences[k + 1].start() if k + 1 < len(occurrences) else len(contenu)
            libelle = nettoyer_libelle(contenu[m.end():fin])
            if len(libelle) < 3:
                continue
            # Le libellé le plus long : les coupures de page tronquent les autres.
            if code not in actes or len(libelle) > len(actes[code]["libelle"]):
                actes[code] = {"code": code, "libelle": libelle, "chapitre": n}
    return actes, titres


# ----------------------------------------------------------------------
# Écriture des fichiers
# ----------------------------------------------------------------------

def ecrire_racines(racines: dict, chemin: str) -> None:
    with open(chemin, "w", newline="", encoding="utf-8") as f:
        entete(f,
               "Fichiers officiels ATIH — Manuel des GHM, version 2025 (arrêté publié au BO du "
               "23/07/2025) : annexe 2 (GHM classés par CMD), annexe 3 (GHM courts et "
               "caractéristiques des racines). Source : "
               "https://www.atih.sante.fr/manuel-des-ghm-2025-publication-bo",
               ["libelle = libellé du GHM représentatif de la racine (version « en ambulatoire » "
                "lorsqu'elle existe, sinon premier niveau publié).",
                "ghm_court : J = ambulatoire strict (0 nuit) ; T0/T1/T2 = très courte durée "
                "(0 jour, 0 à 1 jour, 0 à 2 jours)."])
        w = csv.writer(f, delimiter=";", lineterminator="\n")
        w.writerow(["racine_ghm", "cmd", "categorie_majeure_ghm", "ghm_court",
                    "admet_sejour_0_nuit", "libelle"])
        for r in sorted(racines):
            v = racines[r]
            w.writerow([v["racine"], v["cmd"], v["categorie"] or "", v["ghm_court"],
                        "oui" if v["zero_nuit"] else "non", v["libelle"] or ""])


def ecrire_actes_classants(act_racines: dict, annexe8: dict, annexe11: set,
                           libelles_ghm: dict, chemin: str) -> None:
    codes = sorted(set(annexe8) | set(act_racines))
    with open(chemin, "w", newline="", encoding="utf-8") as f:
        entete(f,
               "Fichiers officiels ATIH — Manuel des GHM, version 2025 : annexe 8 (actes "
               "classants), annexe 11 (actes mineurs reclassant en GHM médical) et volume 2 par "
               "CMD (listes d'actes rattachées aux racines). Source : "
               "https://www.atih.sante.fr/manuel-des-ghm-2025-publication-bo",
               ["Une ligne par acte classant. racines_ghm = racines dans lesquelles l'acte est "
                "classant (volume 2) ; cmds_classantes = CMD de l'annexe 8.",
                "libelle_ghm = libellé abrégé employé par le manuel (les libellés complets "
                "relèvent de la CCAM, voir data/ccam-complete-2025.csv)."])
        w = csv.writer(f, delimiter=";", lineterminator="\n")
        w.writerow(["code_ccam", "racines_ghm", "cmds_classantes", "reclassant_ghm_medical",
                    "libelle_ghm"])
        for code in codes:
            w.writerow([code, " ".join(sorted(act_racines.get(code, []))),
                        " ".join(annexe8.get(code, [])),
                        "oui" if code in annexe11 else "non",
                        libelles_ghm.get(code, "")])


def ecrire_ccam_complete(chapitres: dict, ameli: dict, libelles_ghm: dict, annexe8: dict,
                         chemin: str) -> int:
    codes = sorted(set(chapitres) | set(ameli) | set(annexe8) | set(libelles_ghm))
    lignes = []
    for c in codes:
        if not re.match(r"^[A-Z]{4}\d{3}$", c):
            continue
        if ameli.get(c, {}).get("libelle"):
            libelle, source = ameli[c]["libelle"], "CCAM Ameli (data.gouv.fr)"
        elif chapitres.get(c, {}).get("libelle"):
            libelle, source = chapitres[c]["libelle"], "CCAM descriptive (ATIH, chapitres 1 a 19)"
        elif libelles_ghm.get(c):
            libelle, source = libelles_ghm[c], "Manuel des GHM 2025 (libelle abrege)"
        else:
            libelle, source = "", "introuvable"
        chapitre = (str(chapitres[c]["chapitre"]) if c in chapitres
                    else ameli.get(c, {}).get("chapitre", ""))
        lignes.append([c, libelle, source, chapitre,
                       "oui" if c in ameli else "non",
                       "oui" if c in chapitres else "non",
                       "oui" if c in annexe8 else "non"])
    with open(chemin, "w", newline="", encoding="utf-8") as f:
        entete(f,
               "Nomenclature CCAM consolidée à partir de trois sources officielles : "
               "(1) chapitres 1 à 19 de la CCAM descriptive publiés par l'ATIH "
               "(https://www.atih.sante.fr/sites/default/files/public/content/1621/Chapitre_N.pdf) ; "
               "(2) jeu de données « CCAM Ameli » (data.gouv.fr / InterHop : actes tarifés en "
               "libéral) ; (3) libellés abrégés des listes d'actes du Manuel des GHM 2025. "
               "Union des actes : un acte absent d'une source reste présent si une autre le porte.",
               ["Les libellés sont repris verbatim de la source indiquée (source_libelle) : "
                "la casse diffère donc selon la source.",
                "chapitre_ccam : 1 à 19 ; 18 = gestes complémentaires et d'anesthésie, "
                "19 = adaptations pour la CCAM transitoire (forfaits)."])
        w = csv.writer(f, delimiter=";", lineterminator="\n")
        w.writerow(["code", "libelle", "source_libelle", "chapitre_ccam",
                    "dans_ameli", "dans_atih", "dans_annexe8"])
        w.writerows(lignes)
    return len(lignes)


def lire_ameli_ccam() -> dict:
    """Libellés et chapitres du jeu de données CCAM Ameli (déjà mis en cache par l'import Node)."""
    chemin = ".cache/referentiels/ccam-ameli.csv"
    if not os.path.exists(chemin):
        return {}
    ameli = {}
    for r in csv.DictReader(open(chemin, encoding="utf-8")):
        c = (r.get("ccam") or "").strip()
        if re.match(r"^[A-Z]{4}\d{3}$", c):
            ameli[c] = {"libelle": (r.get("label") or "").strip(),
                        "chapitre": (r.get("chapterCode") or "").strip()}
    return ameli


# ----------------------------------------------------------------------
# Programme
# ----------------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sans-telechargement", action="store_true",
                    help="n'utilise que les PDF déjà présents dans .cache/atih")
    args = ap.parse_args()

    if not args.sans_telechargement:
        for nom, url in ANNEXES.items():
            telecharger(url, os.path.join(GHM_DIR, f"{nom}.pdf"))
        for c in CMDS:
            telecharger(f"{BASE}/4962/vol2cmd{c}.pdf", os.path.join(GHM_DIR, f"vol2cmd{c}.pdf"))
        for n in CHAPITRES:
            telecharger(f"{BASE}/1621/Chapitre_{n}.pdf", os.path.join(GHM_DIR, f"ch{n}.pdf"))

    # --- Annexe 2 + 3 → racines -------------------------------------------------
    ghms = lire_annexe2(texte_pdf(os.path.join(GHM_DIR, "vol1an2.pdf")))
    courts = lire_ghm_courts(texte_pdf(os.path.join(GHM_DIR, "vol1an3.pdf")))
    racines = construire_racines(ghms, courts)

    # --- Annexes 8 et 11 + volume 2 → actes classants ---------------------------
    annexe8 = lire_annexe8(texte_pdf(os.path.join(GHM_DIR, "vol1an8.pdf")))
    annexe11 = lire_annexe11(texte_pdf(os.path.join(GHM_DIR, "vol1an11.pdf")))
    racine_listes, listes, _ = lire_volume2(
        [os.path.join(GHM_DIR, f"vol2cmd{c}.txt") for c in CMDS])
    act_racines, libelles_ghm = {}, {}
    for racine, ids in racine_listes.items():
        for ident in ids:
            for code, libelle in listes.get(ident, []):
                act_racines.setdefault(code, set()).add(racine)
                if libelle and code not in libelles_ghm:
                    libelles_ghm[code] = libelle
    act_racines = {k: sorted(v) for k, v in act_racines.items()}

    # --- Chapitres CCAM 1 à 19 → nomenclature consolidée ------------------------
    chapitres, titres = lire_chapitres(GHM_DIR)
    ameli = lire_ameli_ccam()

    os.makedirs(SORTIE_GHM, exist_ok=True)
    ecrire_racines(racines, os.path.join(SORTIE_GHM, "racines-ghm-2025.csv"))
    ecrire_actes_classants(act_racines, annexe8, annexe11, libelles_ghm,
                           os.path.join(SORTIE_GHM, "actes-classants-ghm-2025.csv"))
    total_ccam = ecrire_ccam_complete(chapitres, ameli, libelles_ghm, annexe8,
                                      "data/ccam-complete-2025.csv")

    # --- Contrôles de cohérence -------------------------------------------------
    j2 = {r for r, v in racines.items() if v["ghm_ambulatoire"]}
    j3 = {r for r, c in courts.items() if c == "J"}
    recoupement = len(set(act_racines) & set(annexe8))
    print(f"racines de GHM                : {len(racines)} (dont {len(j2)} en « J »)")
    print(f"actes classants (annexe 8)    : {len(annexe8)}")
    print(f"actes rattachés à une racine  : {len(act_racines)}")
    print(f"recoupement volume 2 ∩ annexe 8 : {recoupement} "
          f"({recoupement / len(annexe8) * 100:.1f} %)")
    print(f"actes CCAM consolidés         : {total_ccam}")
    print(f"  · libellés : {dict(Counter('CCAM Ameli' if c in ameli else 'ATIH chapitres' if c in chapitres else 'GHM abrégé' for c in (set(chapitres) | set(ameli) | set(act_racines))))}")
    print(f"chapitre 18 (gestes complémentaires) : "
          f"{sum(1 for a in chapitres.values() if a['chapitre'] == 18)} actes")
    print("chapitres : " + " · ".join(f"{n}={titres[n][:26]}" for n in sorted(titres)[:4]) + " …")

    erreurs = []
    if len(racines) < 600:
        erreurs.append(f"{len(racines)} racines de GHM (< 600)")
    if j2 != j3:
        erreurs.append("les racines « J » de l'annexe 2 et de l'annexe 3 diffèrent")
    if len(j2) != 152:
        erreurs.append(f"{len(j2)} GHM ambulatoires stricts (152 attendus)")
    if recoupement < 0.99 * len(annexe8):
        erreurs.append(f"recoupement volume 2 / annexe 8 insuffisant ({recoupement})")
    if total_ccam < 7000:
        erreurs.append(f"{total_ccam} actes CCAM consolidés (< 7 000)")
    if sum(1 for a in chapitres.values() if a["chapitre"] == 18) < 100:
        erreurs.append("chapitre 18 (anesthésies) incomplet")
    # Les actes d'anesthésie générale complémentaire se nomment « … niveau n ». Un libellé qui
    # s'arrête au mot « niveau » signale un nettoyage trop agressif du pied de page — c'est le
    # défaut corrigé ici. Le numéro lui-même n'est pas vérifié : l'ordre des codes n'est pas
    # celui des niveaux (ZZLP054 = niveau 3, ZZLP042 = niveau 4, tel que publié par l'ATIH).
    for code in ("ZZLP025", "ZZLP030", "ZZLP042", "ZZLP054"):
        libre = (chapitres.get(code) or {}).get("libelle", "")
        if not re.search(r"niveau [1-9]$", libre):
            erreurs.append(f"{code} : niveau tronqué « {libre[-46:]} »")
    if erreurs:
        sys.exit("contrôles en échec :\n  - " + "\n  - ".join(erreurs))
    print("\ntous les contrôles sont passés.")


if __name__ == "__main__":
    main()
