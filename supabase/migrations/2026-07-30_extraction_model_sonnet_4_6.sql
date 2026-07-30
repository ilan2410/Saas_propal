-- Bascule le modèle d'extraction de claude-sonnet-5 vers claude-sonnet-4-6.
--
-- Motif : claude-sonnet-5 rejette tout `temperature` non-défaut avec un 400
-- (cf. MODELS_WITHOUT_CUSTOM_TEMPERATURE dans lib/ai/claude.ts). L'extraction
-- tournait donc à la température par défaut (1), ce qui produisait des totaux HT
-- différents pour une même facture d'un appel à l'autre. claude-sonnet-4-6 est le
-- modèle le plus récent qui accepte encore `temperature: 0`.

UPDATE proposition_templates
SET claude_model = 'claude-sonnet-4-6'
WHERE claude_model = 'claude-sonnet-5';

UPDATE organizations
SET claude_model = 'claude-sonnet-4-6'
WHERE claude_model = 'claude-sonnet-5';
