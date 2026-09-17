import type { Metadata } from 'next';
import { LegalLayout, LegalSection } from '@/components/legal/LegalLayout';

export const metadata: Metadata = {
  title: "Conditions Générales d'Utilisation | Proboost",
  description: "Conditions générales d'utilisation de la plateforme Proboost.",
};

export default function CguPage() {
  return (
    <LegalLayout title="Conditions Générales d'Utilisation" updatedAt="16 septembre 2026">
      <LegalSection title="1. Éditeur">
        <p>
          Le service « Proboost » (ci-après « le Service ») est édité par :
        </p>
        <p>
          Livenot — Entrepreneur individuel
          <br />
          SIREN : 749 849 881
          <br />
          SIRET : 749 849 881 00026
          <br />
          Code APE : 6202B
          <br />
          Adresse : 14 rue Pelleport, 75020 Paris, France
          <br />
          TVA non applicable, article 293 B du Code général des impôts
          <br />
          Contact : contact@livenot.net
        </p>
      </LegalSection>

      <LegalSection title="2. Objet">
        <p>
          Les présentes Conditions Générales d&apos;Utilisation (« CGU ») ont pour objet de
          définir les modalités et conditions dans lesquelles Livenot met à disposition des
          utilisateurs professionnels le Service, une plateforme SaaS permettant d&apos;automatiser
          la génération de propositions commerciales, notamment dans les secteurs de la
          téléphonie et de la bureautique, ainsi que les droits et obligations des parties dans
          ce cadre.
        </p>
        <p>
          Toute utilisation du Service implique l&apos;acceptation pleine et entière des présentes
          CGU par l&apos;utilisateur.
        </p>
      </LegalSection>

      <LegalSection title="3. Accès au Service et création de compte">
        <p>
          L&apos;accès au Service nécessite la création d&apos;un compte utilisateur, rattaché à une
          organisation, via une adresse email et un mot de passe, ou via une authentification
          tierce (par exemple Google) lorsque celle-ci est proposée.
        </p>
        <p>
          L&apos;utilisateur s&apos;engage à fournir des informations exactes lors de son inscription
          et à maintenir la confidentialité de ses identifiants de connexion. Toute action
          effectuée depuis un compte est réputée effectuée par le titulaire de ce compte.
        </p>
      </LegalSection>

      <LegalSection title="4. Description du Service">
        <p>Le Service permet notamment à l&apos;utilisateur, dans le cadre de son organisation, de :</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>
            Téléverser des documents clients (factures, contrats) afin d&apos;en extraire
            automatiquement certaines données à l&apos;aide d&apos;un modèle d&apos;intelligence
            artificielle ;
          </li>
          <li>
            Générer automatiquement des propositions commerciales à partir de modèles de
            documents (Word, Excel, PDF) préconfigurés ;
          </li>
          <li>Gérer plusieurs utilisateurs et paramètres au sein d&apos;une même organisation ;</li>
          <li>Consulter des statistiques d&apos;utilisation et de coûts liés au Service ;</li>
          <li>
            Le cas échéant, connecter un calendrier tiers (Google Calendar, Microsoft Calendar)
            afin de synchroniser des évènements liés à son activité.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Crédits et facturation">
        <p>
          L&apos;utilisation du Service repose, selon l&apos;offre souscrite, sur un système de
          crédits consommés à la génération de chaque proposition commerciale. Les paiements
          sont traités par notre prestataire Stripe. Les tarifs applicables sont ceux en
          vigueur au moment de l&apos;achat, tels qu&apos;affichés sur le Service.
        </p>
        <p>
          Sauf disposition contraire, les crédits achetés ne sont ni remboursables ni
          transférables, hors obligation légale contraire.
        </p>
      </LegalSection>

      <LegalSection title="6. Obligations de l&apos;utilisateur">
        <p>L&apos;utilisateur s&apos;engage à :</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>
            N&apos;utiliser le Service qu&apos;à des fins professionnelles licites, conformes à sa
            destination ;
          </li>
          <li>
            Ne téléverser que des documents et données pour lesquels il dispose des droits et
            autorisations nécessaires, y compris s&apos;agissant de données à caractère personnel
            de tiers (clients, prospects) ;
          </li>
          <li>
            Ne pas porter atteinte au bon fonctionnement du Service, notamment par tout procédé
            visant à en perturber l&apos;accès ou la sécurité.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Intelligence artificielle et responsabilité">
        <p>
          Le Service s&apos;appuie sur un modèle d&apos;intelligence artificielle tiers pour extraire
          et suggérer certaines données à partir des documents fournis par l&apos;utilisateur. Ces
          extractions et suggestions sont fournies à titre d&apos;assistance et peuvent contenir des
          erreurs ou inexactitudes.
        </p>
        <p>
          Il appartient à l&apos;utilisateur de vérifier l&apos;exactitude des informations extraites et
          des documents générés avant toute utilisation ou transmission à un tiers. Livenot ne
          saurait être tenu responsable des conséquences résultant d&apos;une utilisation sans
          vérification préalable des documents générés par le Service.
        </p>
      </LegalSection>

      <LegalSection title="8. Propriété intellectuelle">
        <p>
          La structure, le code, les fonctionnalités et l&apos;interface du Service sont la
          propriété de Livenot et sont protégés par le droit de la propriété intellectuelle.
        </p>
        <p>
          Les documents, modèles et données téléversés par l&apos;utilisateur, ainsi que les
          propositions commerciales générées à partir de ceux-ci, demeurent la propriété de
          l&apos;utilisateur ou de son organisation.
        </p>
      </LegalSection>

      <LegalSection title="9. Données personnelles">
        <p>
          Le traitement des données à caractère personnel effectué dans le cadre du Service est
          décrit dans notre{' '}
          <a href="/confidentialite" className="text-blue-600 hover:text-blue-700">
            Politique de confidentialité
          </a>
          , qui fait partie intégrante des présentes CGU.
        </p>
      </LegalSection>

      <LegalSection title="10. Durée, suspension et résiliation">
        <p>
          Le compte est ouvert pour une durée indéterminée. L&apos;utilisateur peut demander la
          clôture de son compte à tout moment en contactant contact@livenot.net.
        </p>
        <p>
          Livenot se réserve le droit de suspendre ou résilier l&apos;accès au Service, sans
          préavis, en cas de manquement grave aux présentes CGU, notamment en cas d&apos;usage
          illicite ou frauduleux du Service.
        </p>
      </LegalSection>

      <LegalSection title="11. Modification des CGU">
        <p>
          Livenot se réserve le droit de modifier les présentes CGU à tout moment. Les
          utilisateurs seront informés de toute modification substantielle. La poursuite de
          l&apos;utilisation du Service après modification vaut acceptation des nouvelles CGU.
        </p>
      </LegalSection>

      <LegalSection title="12. Droit applicable et litiges">
        <p>
          Les présentes CGU sont soumises au droit français. En cas de litige, une solution
          amiable sera recherchée en priorité avant toute action judiciaire. À défaut d&apos;accord
          amiable, les tribunaux français compétents seront seuls compétents.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
