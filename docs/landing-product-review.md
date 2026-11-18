# Revue produit et refonte de la page d’accueil

## Périmètre

Revue transversale des parcours client, des écrans de configuration et des services associés : propositions, extraction, modèles et génération, catalogue, équipe et permissions, suivi commercial, agendas, signature et mise en relation. Les fichiers de travail en cours ont été conservés. Cette intervention modifie la vitrine publique ; elle ne modifie pas les parcours métier.

## Écarts corrigés

- La vitrine utilise des extraits agrandissables de la nouvelle présentation animée fournie par l’utilisateur. Les légendes précisent leur nature illustrative.
- La présentation et la navigation faisaient de SA/SP le passage central. La proposition de valeur porte maintenant sur les documents clients, les modèles Word/Excel et le suivi. La SP se construit avec un questionnaire optionnel ou en saisie directe, selon la configuration du modèle.
- Le questionnaire SP était présenté comme universel, alors que le code contient également un mode direct configuré par modèle.
- La page ne présentait que la téléphonie, alors que le secteur bureautique et les organisations mixtes sont implémentés.
- Les images de l’animation ne sont pas présentées comme l’interface réelle. Les données et marges visibles sont identifiées comme illustratives, sans tarif ni résultat commercial promis.
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
| Modes SP | `PropositionWizard.tsx`, `Step5SpQuestions.tsx`, `Step5EditSp.tsx`, `app/(client)/propositions/[id]/page.tsx`, `lib/templates/supportsSp.ts` | Questionnaire et mode direct selon configuration ; seules les questions SP sont optionnelles |
| Modèles et sorties | `lib/generators/index.ts`, `base-data.ts`, `prepare-proposition.ts`, `word-proposition.ts`, `excel-proposition.ts`, `lib/templates/sub-templates.ts`, `usePropositionGeneration.tsx` | Modèles Word/Excel configurés, documents complémentaires selon réglage ; génération PDF générique non annoncée |
| Comparatif | `Step5Generate.tsx`, `app/api/propositions/[id]/export-comparatif-sa-sp/route.ts` | Word/Excel avec la SP et les droits appropriés |
| Catalogue | `app/(client)/catalogue/page.tsx`, `app/api/catalogue`, `lib/catalogue/resolvePrix.ts` | Produits/services/prix propres à l’activité ; aucun catalogue opérateur universel promis |
| Équipe | `lib/auth/org-context.ts`, `lib/propositions/visibility.ts`, `components/client/ClientSidebar.tsx`, `app/api/settings/team` | Consultation, administration et téléchargement selon les permissions |
| Suivi | `app/(client)/propositions/page.tsx`, `PropositionsListClient.tsx`, `PropositionNoteDialog.tsx`, `PropositionAttachments.tsx`, `app/api/propositions/[id]/notes` | Statuts, brouillons, pièces jointes, notes et rappels ; aucun CRM externe obligatoire |
| Agendas | `lib/calendar`, `app/api/calendar`, `PropositionNoteDialog.tsx` | Google/Microsoft uniquement si connectés |
| Variantes | `app/api/propositions/[id]/variants` | Variantes de proposition ; aucune gestion multisite |
| Signature | `PropositionSignature.tsx`, `lib/docuseal`, `app/api/propositions/[id]/signature` | DocuSeal optionnel/configuré ; envoi du Word et récupération du document signé |
| Accès au service | `ContactForm.tsx`, `app/api/contact/route.ts`, `app/page.tsx` | Mise en relation et espace configuré ; connexion existante maintenue |

## Vidéo et visuels actuels — 18 novembre 2026

La landing page utilise la nouvelle présentation animée fournie par l’utilisateur : 2026-11-18_proboost-promo_paysage.mp4. Elle remplace l’ancien tutoriel et ses captures.

- Vidéo publique : public/videos/proboost-promo.mp4 ; durée 72 secondes ; 1920 × 1080 ; H.264 avec audio AAC. Les flux sont conservés sans réencodage et le conteneur est préparé pour la lecture progressive (faststart).
- Miniature : public/videos/proboost-promo-poster.jpg, extraite à 47,2 secondes.
- public/marketing/promo-offre.webp : construction de l’offre avec catalogue et marge, à 47,2 secondes ; recadrage 1728 × 800 à partir de (96, 60), sortie 1440 × 667.
- public/marketing/promo-analyse.webp : factures et situation actuelle, à 31 secondes ; même recadrage et dimensions.
- public/marketing/promo-document.webp : exemple de proposition commerciale, à 58,5 secondes ; recadrage du document à (680, 56), dimensions 560 × 792.
- public/marketing/promo-comparaison.webp : deux variantes, à 52 secondes ; même recadrage que l’offre, sortie 1440 × 667.

Ces images sont des extraits d’une animation et ne sont pas des captures réelles de l’interface. Les légendes, textes alternatifs et le texte sous la vidéo le précisent. Les données et marges sont illustratives. Aucune image supplémentaire n’a été générée.

Les anciennes images et l’ancien MP4 ne sont plus utilisés et ont été retirés. Le composant partagé TutorialVideo conserve ses exports pour les appels existants, mais affiche la nouvelle présentation et sa durée de 1 min 12. La fenêtre TutorialVideoDialog utilise la même vidéo.

## Comportement du lecteur

Lecture déclenchée au clic, sans autoplay, preload="none", contrôles natifs après démarrage, lecture en ligne sur mobile et lien de téléchargement de secours. Les images restent agrandissables dans le composant ProductScreenshot.
