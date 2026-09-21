/**
 * Point d'entrée de l'interface.
 *
 * Aucune règle métier ici : tout est délégué à `core/rules-engine` via
 * l'assistant pas-à-pas (`wizard.ts`).
 */

import './styles.css';
import { demarrerAssistant } from './wizard.js';

demarrerAssistant();
