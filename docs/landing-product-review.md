# Revue produit et refonte de la page d’accueil

## Périmètre

Revue transversale des parcours client, des écrans de configuration et des services associés : propositions, extraction, modèles et génération, catalogue, équipe et permissions, suivi commercial, agendas, signature et mise en relation. Les fichiers de travail en cours ont été conservés. Cette intervention modifie la vitrine publique ; elle ne modifie pas les parcours métier.

## Écarts corrigés

- Deux interfaces dessinées dans le JSX donnaient une représentation inexacte du produit : elles sont remplacées par des captures réelles et agrandissables.
- La présentation et la navigation faisaient de SA/SP le passage central. La proposition de valeur porte maintenant sur les documents clients, les modèles Word/Excel et le suivi. La SP est présentée comme un module optionnel, conformément au positionnement demandé.
- Le questionnaire SP était présenté comme universel, alors que le code contient également un mode direct configuré par modèle.
- La page ne présentait que la téléphonie, alors que le secteur bureautique et les organisations mixtes sont implémentés.
- Les intitulés et statuts inventés des maquettes sont remplacés par l’interface existante. Les montants visibles sont identifiés comme illustratifs, sans tarif ni résultat commercial promis.
- Le discours répétitif sur le « workflow » est remplacé par des étapes et usages concrets. L’extraction est présentée comme une assistance à vérifier.
- Les options sont assorties de leurs conditions : droits d’accès, modèle configuré, agenda connecté, intégration DocuSeal activée.
- Les promesses générales de compatibilité de tous les fichiers et de génération PDF ne sont pas reprises. L’entrée accepte PDF/images ; les modèles de sortie mis en avant sont Word/Excel.

## Correspondance entre les textes et le code

| Sujet | Éléments examinés | Conséquence éditoriale |
| --- | --- | --- |
| Activités | `types/index.ts`, `lib/sectors.ts`, `app/(client)/propositions/new/page.tsx`, `lib/contact/schema.ts` | Téléphonie et bureautique, organisation simple ou mixte |
| Assistant | `components/propositions/PropositionWizard.tsx`, `Step1SelectTemplate.tsx`, `Step2UploadDocuments.tsx`, `Step3ExtractData.tsx` | Choisir un modèle, importer, contrôler, générer ; pas de nombre d’étapes universel promis |
| Formats d’entrée | `Step2UploadDocuments.tsx`, `app/api/propositions/upload-documents/route.ts`, `lib/ai/document-limits.ts` | PDF, JPEG, PNG, GIF, WebP ; pas de promesse d’import Word/Excel comme sources d’extraction |
| Extraction et validation | `app/api/propositions/extract/route.ts`, `lib/sa/direct-confirmation.ts`, `app/(client)/propositions/[id]/resume/page.tsx` | Lecture assistée et contrôle humain ; pas d’exactitude absolue promise |
| Modes SP | `PropositionWizard.tsx`, `Step5SpQuestions.tsx`, `Step5EditSp.tsx`, `app/(client)/propositions/[id]/page.tsx`, `lib/templates/supportsSp.ts` | Questionnaire et mode direct selon configuration ; module optionnel dans la vitrine |
| Modèles et sorties | `lib/generators/index.ts`, `base-data.ts`, `prepare-proposition.ts`, `word-proposition.ts`, `excel-proposition.ts`, `lib/templates/sub-templates.ts`, `usePropositionGeneration.tsx` | Modèles Word/Excel configurés, documents complémentaires selon réglage ; génération PDF générique non annoncée |
| Comparatif | `Step5Generate.tsx`, `app/api/propositions/[id]/export-comparatif-sa-sp/route.ts` | Word/Excel avec la SP et les droits appropriés |
| Catalogue | `app/(client)/catalogue/page.tsx`, `app/api/catalogue`, `lib/catalogue/resolvePrix.ts` | Produits/services/prix propres à l’activité ; aucun catalogue opérateur universel promis |
| Équipe | `lib/auth/org-context.ts`, `lib/propositions/visibility.ts`, `components/client/ClientSidebar.tsx`, `app/api/settings/team` | Consultation, administration et téléchargement selon les permissions |
| Suivi | `app/(client)/propositions/page.tsx`, `PropositionsListClient.tsx`, `PropositionNoteDialog.tsx`, `PropositionAttachments.tsx`, `app/api/propositions/[id]/notes` | Statuts, brouillons, pièces jointes, notes et rappels ; aucun CRM externe obligatoire |
| Agendas | `lib/calendar`, `app/api/calendar`, `PropositionNoteDialog.tsx` | Google/Microsoft uniquement si connectés |
| Sites et variantes | `PropositionWizard.tsx`, `MultisiteChoiceModal.tsx`, `app/api/propositions/[id]/clone-site`, `app/api/propositions/[id]/variants` | Fonctions disponibles selon dossier/parcours ; pas de génération par site systématique |
| Signature | `PropositionSignature.tsx`, `lib/docuseal`, `app/api/propositions/[id]/signature` | DocuSeal optionnel/configuré ; envoi du Word et récupération du document signé |
| Accès au service | `ContactForm.tsx`, `app/api/contact/route.ts`, `app/page.tsx` | Mise en relation et espace configuré ; connexion existante maintenue |

## Visuels

Les captures proviennent du compte de démonstration déjà utilisé pour le tutoriel fourni. Aucune interface n’a été générée ou redessinée.

- `public/marketing/suivi-propositions.webp` : image à 8,7 s du tutoriel, limitée à la zone de l’application. Le masquage des clients et de l’équipe est celui déjà présent dans la vidéo.
- `public/marketing/choix-modele.webp` : même source, à 10 s.
- `public/marketing/import-documents.webp` : même source, à 13 s.
- `public/marketing/situation-proposee.jpg` : capture `res_total.jpg` des sources du tutoriel, copiée sans modification.

Les trois WebP sont extraits et redimensionnés à partir de la vidéo, sans modification de l’interface. Les légendes indiquent le contexte de démonstration. Les captures se consultent en grand dans une fenêtre accessible au clavier.

## Vidéo conservée

Le composant `TutorialVideo.tsx`, le MP4 et sa miniature restent inchangés pendant cette refonte. La section de démonstration a été reprise à l’identique ; une phrase extérieure précise que l’exemple illustre la téléphonie avec l’option SP.

SHA-256 du MP4 avant et après la refonte : `CA21CC89554114AC580F7841E04EDEA88E8262C1D7AACB795DD302EF593A8166`.

## Validation

- ESLint ciblé sur la page, son composant de captures et les métadonnées : réussi.
- Chrome, largeurs 320, 390, 768, 1024 et 1440 px : aucun débordement horizontal ni image cassée.
- Toutes les ancres internes pointent sur une section existante.
- Agrandissement des captures et fermeture au clavier : réussi.
- Ouverture de la FAQ : réussie.
- Vidéo en pause avant clic, `preload="none"`, sans autoplay ; lecture et contrôles natifs opérationnels après clic, durée 98,033984 s.
- Préférence sombre et réduction des animations : textes et fenêtre de capture lisibles sur leur fond clair.
- Captures produit déjà compressées servies directement, sans réencodage à la volée par Next.js.
- Vérification TypeScript globale : seuls trois imports générés préexistants dans `.next/types/validator.ts` restent en erreur (`/register`, `/api/sp-questions/assist`, `/api/sp-questions/generate`). Aucune erreur signalée dans les fichiers modifiés. Les fichiers générés n’ont pas été supprimés ou modifiés pour contourner ces erreurs.
