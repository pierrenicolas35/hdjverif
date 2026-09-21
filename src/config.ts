/**
 * Configuration de l'accès au référentiel Supabase.
 *
 * La clé `anon` est **publique par conception** : elle est conçue pour être
 * embarquée dans une application web. Les tables de référentiel sont protégées
 * par Row Level Security en lecture seule (voir `supabase/hardening.sql`) :
 * aucune écriture n'est possible depuis le navigateur.
 *
 * Les valeurs peuvent être surchargées à la construction :
 *   VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… npm run build
 */

const env = import.meta.env as Record<string, string | undefined>;

export const SUPABASE_URL: string =
  env['VITE_SUPABASE_URL'] ?? 'https://wscfdjkahejquzptvaxg.supabase.co';

export const SUPABASE_ANON_KEY: string =
  env['VITE_SUPABASE_ANON_KEY'] ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzY2ZkamthaGVqcXV6cHR2YXhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMDMwMjYsImV4cCI6MjEwNTU3OTAyNn0.Up3eqYWLlvezDQ6DvjvtlHV8Mifobs-Zn8KCwLD0_Z0';

/** Délai maximal d'une requête au référentiel (ms). */
export const DELAI_REQUETE_MS = 6000;

/** Nombre maximal de suggestions retournées par recherche. */
export const TAILLE_RESULTATS = 12;
