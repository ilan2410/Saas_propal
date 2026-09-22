import type { Metadata } from 'next';
import { LegalLayout, LegalSection } from '@/components/legal/LegalLayout';

export const metadata: Metadata = {
  title: 'Politique de confidentialité | Proboost',
  description:
    'Politique de confidentialité et de protection des données personnelles de la plateforme Proboost.',
};

export default function ConfidentialitePage() {
  return (
    <LegalLayout title="Politique de confidentialité" updatedAt="16 septembre 2026">
      <LegalSection title="1. Responsable du traitement">
        <p>
          Le responsable du traitement des données à caractère personnel collectées via le
          Service « Proboost » est :
        </p>
        <p>
          Livenot — Entrepreneur individuel
          <br />
          SIREN : 749 849 881 — SIRET : 749 849 881 00026
          <br />
          14 rue Pelleport, 75020 Paris, France
          <br />
          Contact données personnelles : contact@livenot.net
        </p>
      </LegalSection>

      <LegalSection title="2. Données que nous collectons">
        <ul className="list-disc pl-6 space-y-1">
          <li>
            <strong>Données de compte</strong> : adresse email, mot de passe (stocké de façon
            sécurisée et chiffrée par notre prestataire d&apos;authentification), nom de
            l&apos;organisation, rôle au sein de l&apos;organisation ;
          </li>
          <li>
            <strong>Données d&apos;authentification tierce</strong> : lorsque vous vous connectez
            via Google, nous recevons votre adresse email et votre nom associés à votre compte
            Google, ainsi que, si vous activez la synchronisation calendrier, un accès limité
            aux évènements de votre calendrier Google ou Microsoft ;
          </li>
          <li>
            <strong>Documents et contenus téléversés</strong> : factures, contrats et autres
            documents clients que vous importez dans le Service afin d&apos;en extraire des
            données via intelligence artificielle, ainsi que les propositions commerciales
            générées ;
          </li>
          <li>
            <strong>Données de facturation</strong> : historique d&apos;achats de crédits,
            traité par notre prestataire de paiement Stripe, qui ne nous transmet pas vos
            coordonnées bancaires complètes ;
          </li>
          <li>
            <strong>Données techniques</strong> : adresse IP, journaux de connexion,
            préférences d&apos;affichage (thème, densité), cookies strictement nécessaires au
            fonctionnement du Service (session d&apos;authentification).
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Finalités et bases légales du traitement">
        <ul className="list-disc pl-6 space-y-1">
          <li>
            <strong>Fourniture du Service</strong> (création de compte, génération de
            propositions commerciales, extraction de données) : exécution du contrat conclu
            avec vous ou votre organisation (article 6.1.b du RGPD) ;
          </li>
          <li>
            <strong>Gestion des paiements et de la facturation</strong> : exécution du contrat
            et respect de nos obligations légales et comptables ;
          </li>
          <li>
            <strong>Synchronisation calendrier</strong> (le cas échéant) : consentement
            explicite recueilli lors de la connexion de votre compte Google ou Microsoft ;
          </li>
          <li>
            <strong>Sécurité, prévention de la fraude et amélioration du Service</strong> :
            intérêt légitime de Livenot ;
          </li>
          <li>
            <strong>Communications relatives au Service</strong> (support, informations
            importantes sur votre compte) : exécution du contrat ou intérêt légitime.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Destinataires et sous-traitants">
        <p>
          Vos données sont traitées par Livenot et par les prestataires techniques suivants,
          agissant en qualité de sous-traitants au sens du RGPD :
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>
            <strong>Supabase</strong> : hébergement de la base de données, de
            l&apos;authentification et du stockage de fichiers ;
          </li>
          <li>
            <strong>Anthropic</strong> (modèle Claude) : traitement par intelligence
            artificielle des documents que vous téléversez, aux seules fins d&apos;extraction et
            de suggestion de données dans le cadre de la génération de vos propositions
            commerciales ;
          </li>
          <li>
            <strong>Stripe</strong> : traitement des paiements et de la facturation des
            crédits ;
          </li>
          <li>
            <strong>Google LLC / Microsoft Corporation</strong> : uniquement si vous activez
            volontairement la connexion à Google Calendar ou Microsoft Calendar, afin de
            synchroniser vos évènements.
          </li>
        </ul>
        <p>
          Nous ne vendons ni ne louons vos données personnelles à des tiers à des fins
          commerciales.
        </p>
      </LegalSection>

      <LegalSection title="5. Transferts de données hors Union européenne">
        <p>
          Certains de nos prestataires (notamment Anthropic, Google, Microsoft) sont susceptibles
          de traiter des données en dehors de l&apos;Union européenne, notamment aux États-Unis.
          Ces transferts sont encadrés par des garanties appropriées, telles que les clauses
          contractuelles types de la Commission européenne, conformément aux articles 44 et
          suivants du RGPD.
        </p>
      </LegalSection>

      <LegalSection title="6. Durée de conservation">
        <p>
          Vos données de compte et les documents associés sont conservés pendant toute la durée
          de vie de votre compte, puis supprimés ou archivés dans un délai raisonnable après sa
          clôture, sauf obligation légale de conservation plus longue (notamment en matière
          comptable et fiscale, où les données de facturation sont conservées pendant la durée
          légale applicable).
        </p>
      </LegalSection>

      <LegalSection title="7. Sécurité des données">
        <p>
          Nous mettons en œuvre des mesures techniques et organisationnelles raisonnables
          (chiffrement des mots de passe, contrôle d&apos;accès par rôle, connexions chiffrées
          HTTPS) afin de protéger vos données contre l&apos;accès non autorisé, la perte ou
          l&apos;altération.
        </p>
      </LegalSection>

      <LegalSection title="8. Cookies">
        <p>
          Le Service utilise uniquement des cookies strictement nécessaires à son
          fonctionnement (maintien de votre session de connexion, mémorisation de vos
          préférences d&apos;affichage). Le Service n&apos;utilise pas de cookies publicitaires ou de
          traceurs tiers à des fins de suivi marketing.
        </p>
      </LegalSection>

      <LegalSection title="9. Vos droits">
        <p>
          Conformément au Règlement général sur la protection des données (RGPD) et à la loi «
          Informatique et Libertés », vous disposez des droits suivants sur vos données
          personnelles : droit d&apos;accès, de rectification, d&apos;effacement, de limitation du
          traitement, d&apos;opposition et de portabilité.
        </p>
        <p>
          Pour exercer ces droits, vous pouvez nous contacter à l&apos;adresse{' '}
          <a href="mailto:contact@livenot.net" className="text-blue-600 hover:text-blue-700">
            contact@livenot.net
          </a>
          . Vous disposez également du droit d&apos;introduire une réclamation auprès de la
          Commission Nationale de l&apos;Informatique et des Libertés (CNIL) — www.cnil.fr.
        </p>
      </LegalSection>

      <LegalSection title="10. Modifications de la présente politique">
        <p>
          Nous pouvons être amenés à modifier la présente politique de confidentialité,
          notamment pour refléter une évolution du Service ou de la réglementation applicable.
          La date de dernière mise à jour figure en haut de cette page.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
