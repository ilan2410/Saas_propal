import Link from 'next/link';
import {
  ArrowDown, ArrowRight, CalendarClock, Check, CheckCircle2, ChevronDown,
  FileCheck2, FileInput, FileSpreadsheet, FileText, FolderOpen, Layers3,
  ListChecks, Package, PenLine, Radio, SlidersHorizontal, Users, WandSparkles,
} from 'lucide-react';
import { BrandLogo } from '@/components/shared/BrandLogo';
import { TutorialVideo } from '@/components/shared/TutorialVideo';
import { ContactForm } from '@/components/marketing/ContactForm';
import { ProductScreenshot } from '@/components/marketing/ProductScreenshot';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-4';
const primaryButton = `inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 ${focusRing}`;
const sectionTitle = 'text-balance text-3xl font-semibold leading-[1.1] tracking-[-0.035em] sm:text-4xl lg:text-5xl';
const eyebrow = 'text-xs font-bold uppercase tracking-[0.16em] text-blue-700';

const steps = [
  { icon: Layers3, title: 'Choisissez votre modèle', description: 'Sélectionnez le modèle Word ou Excel préparé pour votre activité et votre organisation.' },
  { icon: FileInput, title: 'Ajoutez les pièces du client', description: 'Importez les factures et contrats en PDF ou en photo, dans le même dossier.' },
  { icon: WandSparkles, title: 'Vérifiez les données extraites', description: 'L’IA lit les documents et structure les informations. Vous contrôlez et corrigez les données avant de poursuivre.' },
  { icon: FileCheck2, title: 'Générez vos documents', description: 'Retrouvez les informations dans votre modèle, téléchargez votre proposition et conservez le dossier pour la suite.' },
];

const features = [
  { icon: Package, title: 'Votre catalogue produits', description: 'Centralisez vos produits, services et prix par activité pour les retrouver lors de la préparation des offres.' },
  { icon: Users, title: 'Des accès par commercial', description: 'Définissez qui peut consulter les dossiers, gérer les modèles ou le catalogue et télécharger les documents.' },
  { icon: CalendarClock, title: 'Des notes et des rappels', description: 'Conservez les échanges et préparez la prochaine action. Reliez les rappels à Google ou Microsoft si vous connectez votre agenda.' },
  { icon: FolderOpen, title: 'Un dossier qui reste accessible', description: 'Retrouvez les pièces jointes, reprenez un brouillon et suivez le statut commercial depuis la liste des propositions.' },
  { icon: ListChecks, title: 'Plusieurs sites, plusieurs offres', description: 'Selon le dossier et le parcours configuré, préparez des propositions par site ou créez des variantes de votre offre.' },
  { icon: PenLine, title: 'La signature, si vous l’activez', description: 'Avec l’intégration DocuSeal configurée, envoyez un document Word en signature et retrouvez le document signé dans le dossier.' },
];

const questions = [
  { question: 'À qui s’adresse Proboost ?', answer: 'Aux équipes commerciales en téléphonie et en bureautique. Une organisation peut travailler dans l’une de ces activités ou dans les deux, avec des modèles et des catalogues adaptés.' },
  { question: 'Est-ce que je garde mes modèles Word et Excel ?', answer: 'Oui. Vos fichiers Word et Excel servent de base aux modèles configurés dans Proboost. Les champs, tableaux et documents complémentaires sont préparés pour que les données du dossier alimentent vos documents.' },
  { question: 'La Situation proposée (SP) est-elle obligatoire ?', answer: 'Non. La SP est un module optionnel pour construire et chiffrer une nouvelle offre. Selon vos besoins et la configuration de votre modèle, vous pouvez travailler avec un questionnaire ou directement dans le panier. Le parcours présenté dans la vidéo illustre un exemple avec cette option.' },
  { question: 'Quels documents puis-je importer ?', answer: 'Les documents sources peuvent être des PDF ou des images JPEG, PNG, GIF et WebP. Vous pouvez notamment importer des factures, des contrats ou des photos de documents. Les informations extraites restent à vérifier avant de les utiliser.' },
  { question: 'Comment démarrer ?', answer: 'Présentez-nous votre activité et les documents que vous utilisez. Nous échangeons sur vos modèles, vos données à reprendre et les options utiles à votre équipe avant de configurer votre espace.' },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-[family-name:var(--font-geist-sans)] text-slate-950 [color-scheme:light] selection:bg-blue-100 selection:text-blue-950">
      <a href="#contenu" className={`sr-only z-50 rounded-lg bg-white px-4 py-3 font-semibold focus:not-sr-only focus:fixed focus:left-4 focus:top-4 ${focusRing}`}>Aller au contenu</a>
      <header className="border-b border-slate-200 bg-white">
        <nav aria-label="Navigation principale" className="mx-auto flex min-h-20 max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="Accueil Proboost" className={`rounded-lg ${focusRing}`}>
            <BrandLogo className="w-[145px] sm:w-[180px]" priority />
          </Link>
          <div className="hidden items-center gap-7 text-sm font-medium text-slate-600 lg:flex">
            <a href="#fonctionnement" className={`rounded hover:text-blue-700 ${focusRing}`}>La plateforme</a>
            <a href="#modeles" className={`rounded hover:text-blue-700 ${focusRing}`}>Vos modèles</a>
            <a href="#equipe" className={`rounded hover:text-blue-700 ${focusRing}`}>Votre équipe</a>
            <a href="#demo" className={`rounded hover:text-blue-700 ${focusRing}`}>La démo</a>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/login" className={`rounded-lg px-2 py-2 text-xs font-semibold text-slate-700 hover:text-blue-700 sm:px-3 sm:text-sm ${focusRing}`}>Se connecter</Link>
            <a href="#contact" className="hidden min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-4 sm:inline-flex">
              Parlons de votre projet <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </div>
        </nav>
      </header>

      <main id="contenu">
        <section className="overflow-hidden bg-[linear-gradient(135deg,#fff_40%,#eff4ff_100%)]">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 sm:py-20 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14 lg:px-8 lg:py-24">
            <div>
              <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 sm:text-sm">
                <Radio className="size-4" aria-hidden="true" /> Téléphonie & bureautique
              </p>
              <h1 className="max-w-[17ch] text-balance text-[clamp(2.65rem,4.8vw,4.6rem)] font-semibold leading-[1.03] tracking-[-0.045em]">
                Vos propositions.<br />Vos modèles.<br /><span className="text-blue-600">Moins de ressaisie.</span>
              </h1>
              <p className="mt-7 max-w-xl text-pretty text-lg leading-8 text-slate-600">
                Importez les documents du client, vérifiez les informations extraites et générez votre proposition dans vos modèles Word ou Excel. Proboost réunit la préparation et le suivi dans un même espace.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <a href="#contact" className={primaryButton}>Parlons de votre projet <ArrowRight className="size-4" aria-hidden="true" /></a>
                <a href="#demo" className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition-colors hover:border-blue-400 hover:bg-blue-50 ${focusRing}`}>
                  Voir la démo · 1 min 38 <ArrowDown className="size-4" aria-hidden="true" />
                </a>
              </div>
              <p className="mt-6 flex items-center gap-2 text-sm text-slate-500"><CheckCircle2 className="size-4 shrink-0 text-blue-600" aria-hidden="true" />Vos fichiers habituels, préparés pour votre équipe.</p>
            </div>
            <div className="min-w-0">
              <div className="mb-4 flex items-center gap-2 text-xs font-semibold text-slate-600"><span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />Dans la plateforme : vos propositions et leur suivi</div>
              <ProductScreenshot src="/marketing/suivi-propositions.webp" alt="La liste des propositions dans Proboost" caption="Capture réelle du compte de démonstration. Données clients masquées ; chiffres et montants illustratifs." width={1440} height={702} priority />
            </div>
          </div>
        </section>

        <div className="border-y border-slate-200 bg-white">
          <div className="mx-auto grid max-w-7xl divide-y divide-slate-200 px-4 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-6 lg:px-8">
            {[
              { icon: FileInput, title: 'Vos pièces client', text: 'Factures, contrats, PDF et photos' },
              { icon: FileSpreadsheet, title: 'Vos modèles', text: 'Propositions Word et Excel' },
              { icon: FolderOpen, title: 'Votre suivi', text: 'Dossiers, statuts, notes et rappels' },
            ].map((item) => (
              <div key={item.title} className="flex items-center gap-4 py-6 sm:px-5 sm:first:pl-0 sm:last:pr-0">
                <item.icon className="size-6 shrink-0 text-blue-600" aria-hidden="true" />
                <div><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">{item.text}</p></div>
              </div>
            ))}
          </div>
        </div>

        <section id="demo" aria-labelledby="demo-title" className="scroll-mt-20 bg-[#edf3ff] py-20 sm:py-28">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="mb-10 text-center">
              <p className="mb-4 text-sm font-bold uppercase tracking-widest text-[#2f6fe9]">La démo en 1 min 38</p>
              <h2 id="demo-title" className="text-balance text-[clamp(2.25rem,4vw,4.25rem)] font-bold leading-[1.02] tracking-[-0.04em] text-slate-950">
                Découvrez Proboost en action
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-8 text-slate-600">
                De la facture client à la proposition commerciale : le parcours complet en 1 min 38.
              </p>
            </div>
            <TutorialVideo />
            <div className="mt-8 text-center">
              <a href="#contact" className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#3d7eff] px-6 py-3 font-bold text-white transition-colors hover:bg-[#2f6fe9] ${focusRing}`}>
                Être recontacté
                <ArrowRight className="size-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
        <p className="bg-[#edf3ff] px-4 pb-8 text-center text-sm leading-6 text-slate-600">Cette démonstration présente un exemple en téléphonie avec l’option Situation proposée.</p>

        <section id="fonctionnement" className="scroll-mt-8 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <p className={eyebrow}>De vos pièces client à votre document</p>
            <h2 className={`mt-4 max-w-3xl ${sectionTitle}`}>Un dossier à préparer.<br />Un chemin clair pour avancer.</h2>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">Le modèle donne le cadre. Les documents apportent les données. Vous gardez la main sur les informations et la proposition finale.</p>
            <div className="mt-12 grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
              <ol className="divide-y divide-slate-200 border-y border-slate-200">
                {steps.map((step, index) => (
                  <li key={step.title} className="flex gap-4 py-6 sm:gap-5">
                    <span className="pt-1 font-mono text-xs font-medium text-blue-600">0{index + 1}</span>
                    <div><h3 className="flex items-center gap-2 text-lg font-semibold"><step.icon className="size-4 shrink-0 text-slate-500" aria-hidden="true" />{step.title}</h3><p className="mt-2 text-sm leading-7 text-slate-600">{step.description}</p></div>
                  </li>
                ))}
              </ol>
              <ProductScreenshot src="/marketing/import-documents.webp" alt="L’import des documents clients dans Proboost" caption="L’écran d’import de la plateforme : PDF et photos réunis dans le dossier. Capture du compte de démonstration." width={1440} height={702} />
            </div>
          </div>
        </section>

        <section id="modeles" className="scroll-mt-8 border-y border-slate-200 bg-slate-50 py-20 sm:py-28">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:px-8">
            <div className="order-2 lg:order-1">
              <ProductScreenshot src="/marketing/choix-modele.webp" alt="Le choix d’un modèle Word ou Excel dans Proboost" caption="Deux modèles dans le compte de démonstration. Les étapes affichées dépendent du parcours configuré pour le modèle." width={1440} height={702} />
            </div>
            <div className="order-1 lg:order-2">
              <p className={eyebrow}>Vos modèles Word & Excel</p>
              <h2 className={`mt-4 ${sectionTitle}`}>Votre document reste<br />votre document.</h2>
              <p className="mt-6 text-lg leading-8 text-slate-600">Vos propositions ont déjà une présentation, des tableaux et une logique commerciale. Nous configurons vos modèles pour y intégrer les données du dossier.</p>
              <ul className="mt-7 space-y-4">
                {['Vos fichiers Word ou Excel comme point de départ', 'Les champs et tableaux préparés pour vos données', 'Des documents complémentaires à générer, si configurés'].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm leading-6 text-slate-700"><Check className="mt-0.5 size-5 shrink-0 text-blue-600" aria-hidden="true" />{item}</li>
                ))}
              </ul>
              <a href="#contact" className={`mt-8 inline-flex min-h-11 items-center gap-2 rounded text-sm font-semibold text-blue-700 hover:text-blue-900 ${focusRing}`}>Parlons de vos modèles <ArrowRight className="size-4" aria-hidden="true" /></a>
            </div>
          </div>
        </section>

        <section id="options" className="scroll-mt-8 bg-[#0b1528] py-20 text-white sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid items-start gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-300">Un module optionnel</p>
                <h2 className={`mt-4 ${sectionTitle}`}>Besoin de construire<br />la nouvelle offre ?</h2>
                <p className="mt-6 text-lg leading-8 text-slate-300">La Situation proposée (SP) permet de composer et chiffrer une offre à partir de votre catalogue, puis de la comparer à l’existant.</p>
                <p className="mt-4 leading-7 text-slate-300">Ce module s’ajoute selon vos besoins. <strong className="font-semibold text-white">Il n’est pas obligatoire pour utiliser Proboost.</strong></p>
                <div className="mt-8 space-y-5 border-t border-white/15 pt-7">
                  <div><h3 className="flex items-center gap-2 font-semibold"><ListChecks className="size-4 text-blue-300" aria-hidden="true" />Avec un questionnaire</h3><p className="mt-2 text-sm leading-6 text-slate-300">Des questions préparées pour guider les choix du commercial.</p></div>
                  <div><h3 className="flex items-center gap-2 font-semibold"><SlidersHorizontal className="size-4 text-blue-300" aria-hidden="true" />En mode direct</h3><p className="mt-2 text-sm leading-6 text-slate-300">Le panier de l’offre se construit et s’ajuste directement dans le dossier.</p></div>
                </div>
                <p className="mt-5 text-xs leading-6 text-slate-400">Le mode et les règles de calcul sont définis dans la configuration du modèle.</p>
              </div>
              <div className="min-w-0 rounded-2xl bg-white p-3 sm:p-5 lg:mt-4">
                <ProductScreenshot src="/marketing/situation-proposee.jpg" alt="Le résumé d’une situation proposée dans Proboost" caption="Exemple en téléphonie avec l’option SP. Les montants illustrent ce dossier de démonstration ; ils ne constituent pas une promesse d’économie." width={1400} height={575} />
                <p className="mt-6 flex items-center gap-2 border-t border-slate-200 pt-4 text-xs leading-6 text-slate-600"><FileText className="size-4 shrink-0 text-blue-600" aria-hidden="true" />Comparatif SA/SP exportable en Word ou Excel selon les droits d’accès.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="equipe" className="scroll-mt-8 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-6 lg:grid-cols-2 lg:gap-16">
              <div><p className={eyebrow}>Le travail continue après la génération</p><h2 className={`mt-4 ${sectionTitle}`}>Votre équipe retrouve<br />le fil de chaque dossier.</h2></div>
              <p className="max-w-xl text-lg leading-8 text-slate-600 lg:self-end">Un brouillon à reprendre, une relance à préparer, une offre à ajuster : les ressources et le suivi restent dans l’espace de votre organisation, selon les accès de chacun.</p>
            </div>
            <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <article key={feature.title} className="border-t border-slate-200 pt-6">
                  <feature.icon className="size-6 text-blue-600" aria-hidden="true" />
                  <h3 className="mt-5 text-lg font-semibold tracking-tight">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{feature.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="faq-title" className="border-y border-slate-200 bg-slate-50 py-20 sm:py-24">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20 lg:px-8">
            <div><p className={eyebrow}>Avant de démarrer</p><h2 id="faq-title" className={`mt-4 ${sectionTitle}`}>Quelques réponses concrètes.</h2></div>
            <div className="divide-y divide-slate-200 border-y border-slate-200">
              {questions.map((item) => (
                <details key={item.question} className="group py-5">
                  <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-6 rounded text-base font-semibold text-slate-900 [&::-webkit-details-marker]:hidden ${focusRing}`}>
                    {item.question}<ChevronDown className="size-5 shrink-0 text-blue-600 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                  </summary>
                  <p className="pb-1 pt-4 text-sm leading-7 text-slate-600">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="contact" className="scroll-mt-8 bg-[#edf3ff] py-20 sm:py-28">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20 lg:px-8">
            <div>
              <p className={eyebrow}>Parlons de votre projet</p>
              <h2 className={`mt-4 ${sectionTitle}`}>Partons de votre façon de travailler.</h2>
              <p className="mt-6 max-w-lg text-lg leading-8 text-slate-600">Vos modèles, votre activité, votre équipe : dites-nous ce que vous souhaitez simplifier. Nous vous recontactons pour préparer un espace adapté à vos besoins.</p>
              <ol className="mt-9 space-y-5 border-t border-blue-200 pt-7">
                {['Un échange sur vos usages et vos documents', 'Les modèles et options utiles à votre activité', 'Un espace configuré pour votre organisation'].map((item, index) => (
                  <li key={item} className="flex gap-4 text-sm leading-6 text-slate-700"><span className="font-mono text-blue-700">0{index + 1}</span>{item}</li>
                ))}
              </ol>
              <p className="mt-8 text-sm text-slate-600">Déjà utilisateur ? <Link href="/login" className={`rounded font-semibold text-blue-700 underline underline-offset-4 hover:text-blue-900 ${focusRing}`}>Accéder à mon espace</Link></p>
            </div>
            <ContactForm />
          </div>
        </section>
      </main>

      <footer className="bg-[#0b1528] px-4 py-10 text-slate-300 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
          <div><BrandLogo variant="dark" className="w-[190px]" /><p className="mt-3 text-xs text-slate-400">Propositions commerciales · Téléphonie & bureautique</p></div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4 text-sm">
            <Link href="/confidentialite" className={`rounded hover:text-white ${focusRing}`}>Confidentialité</Link>
            <Link href="/cgu" className={`rounded hover:text-white ${focusRing}`}>Conditions d’utilisation</Link>
            <span className="text-xs text-slate-400">© {new Date().getFullYear()} Livenot</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
