import Link from 'next/link';
import {
  ArrowDown, ArrowRight, CalendarClock, Check, ChevronDown, Clock3, TrendingUp,
  FileCheck2, FileInput, FileSpreadsheet, FileText, FolderOpen,
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
  { icon: FileInput, title: 'Importez les factures opérateurs', description: 'Importez les factures opérateurs et contrats en PDF ou en photo, dans le même dossier.' },
  { icon: WandSparkles, title: 'Vérifiez les données extraites', description: 'L’IA lit les documents et structure les informations. Vous contrôlez et corrigez les données avant de poursuivre.' },
  { icon: SlidersHorizontal, title: 'Construisez votre nouvelle offre', description: 'Préparez la situation proposée avec des questions guidées ou directement en remplissant les cases.' },
  { icon: FileCheck2, title: 'Générez vos documents', description: 'Retrouvez les informations dans votre modèle, téléchargez votre proposition et conservez le dossier pour la suite.' },
];

const features = [
  { icon: Package, title: 'Votre catalogue produits', description: 'Centralisez vos produits, services et prix par activité pour les retrouver lors de la préparation des offres.' },
  { icon: Users, title: 'Des accès par commercial', description: 'Définissez qui peut consulter les dossiers, gérer les modèles ou le catalogue et télécharger les documents.' },
  { icon: CalendarClock, title: 'Des notes et des rappels', description: 'Conservez les échanges et préparez la prochaine action. Reliez les rappels à Google ou Microsoft si vous connectez votre agenda.' },
  { icon: FolderOpen, title: 'Un dossier qui reste accessible', description: 'Retrouvez les pièces jointes, reprenez un brouillon et suivez le statut commercial depuis la liste des propositions.' },
  { icon: ListChecks, title: 'Plusieurs variantes de votre offre', description: 'Créez des variantes de votre proposition pour présenter plusieurs scénarios au prospect.' },
  { icon: PenLine, title: 'La signature, si vous l’activez', description: 'DocuSeal est actuellement intégré pour la signature électronique. D’autres plateformes de signature électronique viendront s’ajouter à la liste.' },
];

const questions = [
  { question: 'À qui s’adresse Proboost ?', answer: 'Aux équipes commerciales en téléphonie et en bureautique. Une organisation peut travailler dans l’une de ces activités ou dans les deux, avec des modèles et des catalogues adaptés.' },
  { question: 'Est-ce que je garde mes modèles Word et Excel ?', answer: 'Oui. Nous importons vos propres modèles Word ou Excel, ceux que votre entreprise utilise déjà au quotidien, puis nous les configurons pour qu’ils se remplissent automatiquement à chaque proposition.' },
  { question: 'Faut-il répondre à des questions pour construire la SP ?', answer: 'Non. Seules les questions SP sont optionnelles. Vous construisez votre situation proposée soit avec un questionnaire qui guide vos choix, soit en mode direct en remplissant les cases. Le mode est défini dans la configuration du modèle.' },
  { question: 'Quels documents puis-je importer ?', answer: 'Les documents sources peuvent être des PDF ou des images JPEG, PNG, GIF et WebP. Vous pouvez notamment importer des factures opérateurs, des contrats ou des photos de documents. Les informations extraites restent à vérifier avant de les utiliser.' },
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
              Demander une démonstration <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </div>
        </nav>
      </header>

      <main id="contenu">
        <section aria-labelledby="hero-title" className="overflow-hidden bg-[radial-gradient(ellipse_at_top,#eaf1ff_0%,#fff_70%)]">
          <div className="mx-auto max-w-7xl px-4 pb-14 pt-12 sm:px-6 sm:pt-20 lg:px-8">
            <div className="mx-auto max-w-5xl text-center">
              <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 sm:text-sm">
                <Radio className="size-4" aria-hidden="true" /> Pour les équipes commerciales en téléphonie
              </p>
              <h1 id="hero-title" className="text-balance text-[clamp(2.3rem,4.7vw,4.15rem)] font-semibold leading-[1.09] tracking-[-0.045em]">
                Combien de temps consacrez-vous à chaque proposition commerciale <span className="text-blue-600">en téléphonie ?</span>
              </h1>
              <p className="mx-auto mt-7 max-w-3xl text-pretty text-lg leading-8 text-slate-600">
                Analyser les factures opérateurs, construire l’offre, remplir vos documents… La préparation prend du temps à vos commerciaux.
              </p>
              <p className="mx-auto mt-4 max-w-3xl text-pretty text-base leading-7 text-slate-700 sm:text-lg">
                Avec Proboost, automatisez la préparation de vos propositions dans les modèles Word ou Excel que vous utilisez déjà.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <a href="#contact" className={primaryButton}>Demander une démonstration <ArrowRight className="size-4" aria-hidden="true" /></a>
                <a href="#fonctionnement" className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition-colors hover:border-blue-400 hover:bg-blue-50 ${focusRing}`}>
                  Voir comment ça fonctionne <ArrowDown className="size-4" aria-hidden="true" />
                </a>
              </div>
              <p className="mt-6 text-sm font-medium text-slate-600">Moins de ressaisie. Plus de temps pour vos clients.</p>
            </div>
            <div className="mx-auto mt-12 max-w-6xl sm:mt-16">
              <div className="mb-4 flex items-center gap-2 text-xs font-semibold text-slate-600"><span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />Votre catalogue, votre offre, vos marges</div>
              <ProductScreenshot src="/marketing/promo-offre.webp" alt="Illustration de la construction d’une offre avec le catalogue et les marges" caption="Extrait de la présentation animée Proboost : construction de l’offre à partir du catalogue. Données et marges illustratives." width={1440} height={667} priority />
            </div>
          </div>
        </section>

        <div className="border-y border-slate-200 bg-white">
          <div className="mx-auto grid max-w-7xl divide-y divide-slate-200 px-4 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-6 lg:px-8">
            {[
              { icon: FileInput, title: 'Vos pièces client', text: 'Factures opérateurs, contrats, PDF et photos' },
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

        <section id="fonctionnement" className="scroll-mt-8 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <p className={eyebrow}>De la facture opérateur à la proposition</p>
            <h2 className={`mt-4 max-w-3xl ${sectionTitle}`}>Votre prochaine proposition,<br />avec moins de saisie.</h2>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">Choisissez votre modèle habituel, puis laissez les données du dossier alimenter votre proposition. Vous gardez la main à chaque étape.</p>
            <div className="mt-12 grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
              <ol className="divide-y divide-slate-200 border-y border-slate-200">
                {steps.map((step, index) => (
                  <li key={step.title} className="flex gap-4 py-6 sm:gap-5">
                    <span className="pt-1 font-mono text-xs font-medium text-blue-600">0{index + 1}</span>
                    <div><h3 className="flex items-center gap-2 text-lg font-semibold"><step.icon className="size-4 shrink-0 text-slate-500" aria-hidden="true" />{step.title}</h3><p className="mt-2 text-sm leading-7 text-slate-600">{step.description}</p></div>
                  </li>
                ))}
              </ol>
              <ProductScreenshot src="/marketing/promo-analyse.webp" alt="Illustration de l’analyse des factures opérateurs et de la situation actuelle" caption="Extrait de la présentation animée : les données des factures et contrats alimentent la situation actuelle. Les informations extraites restent à vérifier." width={1440} height={667} />
            </div>
          </div>
        </section>

        <section id="modeles" className="scroll-mt-8 border-y border-slate-200 bg-slate-50 py-20 sm:py-28">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:px-8">
            <div className="order-2 mx-auto w-full max-w-sm lg:order-1">
              <ProductScreenshot src="/marketing/promo-document.webp" alt="Illustration d’une proposition commerciale aux couleurs de l’entreprise" caption="Exemple de document dans la présentation animée. Vos propres modèles Word ou Excel sont importés et configurés pour être remplis automatiquement." width={560} height={792} />
            </div>
            <div className="order-1 lg:order-2">
              <p className={eyebrow}>Vos modèles Word & Excel</p>
              <h2 className={`mt-4 ${sectionTitle}`}>Vos modèles du quotidien.<br />Le remplissage en moins.</h2>
              <p className="mt-6 text-lg leading-8 text-slate-600">Nous importons les modèles Word ou Excel que votre entreprise utilise déjà tous les jours, puis nous les configurons pour qu’ils se remplissent automatiquement à chaque proposition, avec votre présentation et vos tableaux.</p>
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
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-300">Deux façons de construire votre offre</p>
                <h2 className={`mt-4 ${sectionTitle}`}>Une offre adaptée au client.<br />Deux façons de la construire.</h2>
                <p className="mt-6 text-lg leading-8 text-slate-300">La Situation proposée (SP) permet de composer et chiffrer une offre à partir de votre catalogue, puis de la comparer à l’existant.</p>
                <p className="mt-4 leading-7 text-slate-300"><strong className="font-semibold text-white">Seules les questions SP sont optionnelles.</strong> Construisez votre situation proposée avec un questionnaire ou en mode direct en remplissant les cases.</p>
                <div className="mt-8 space-y-5 border-t border-white/15 pt-7">
                  <div><h3 className="flex items-center gap-2 font-semibold"><ListChecks className="size-4 text-blue-300" aria-hidden="true" />Avec un questionnaire</h3><p className="mt-2 text-sm leading-6 text-slate-300">Des questions préparées pour guider les choix du commercial.</p></div>
                  <div><h3 className="flex items-center gap-2 font-semibold"><SlidersHorizontal className="size-4 text-blue-300" aria-hidden="true" />En mode direct</h3><p className="mt-2 text-sm leading-6 text-slate-300">Le panier de l’offre se construit et s’ajuste directement dans le dossier.</p></div>
                </div>
                <p className="mt-5 text-xs leading-6 text-slate-400">Les modes de préparation sont configurés avec vos modèles.</p>
              </div>
              <div className="min-w-0 rounded-2xl bg-white p-3 sm:p-5 lg:mt-4">
                <ProductScreenshot src="/marketing/promo-comparaison.webp" alt="Illustration de deux variantes d’une situation proposée" caption="Extrait de la présentation animée : deux variantes pour ajuster l’offre. Les marges affichées sont illustratives." width={1440} height={667} />
                <p className="mt-6 flex items-center gap-2 border-t border-slate-200 pt-4 text-xs leading-6 text-slate-600"><FileText className="size-4 shrink-0 text-blue-600" aria-hidden="true" />Comparatif SA/SP exportable en Word ou Excel selon les droits d’accès.</p>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="benefices-title" className="py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <p className={eyebrow}>Ce que votre équipe y gagne</p>
            <h2 id="benefices-title" className={'mt-4 max-w-3xl ' + sectionTitle}>Du temps pour vendre.<br />Des offres plus faciles à défendre.</h2>
            <div className="mt-12 grid gap-9 md:grid-cols-3 md:gap-10">
              {[
                { icon: Clock3, title: 'Allégez la préparation', text: 'Réduisez les ressaisies entre les factures opérateurs et vos documents commerciaux. Votre équipe se concentre sur le besoin du prospect.' },
                { icon: FileSpreadsheet, title: 'Gardez une présentation cohérente', text: 'Chaque commercial s’appuie sur les modèles et le catalogue de votre entreprise. Vos propositions conservent votre présentation.' },
                { icon: TrendingUp, title: 'Rendez la valeur de l’offre visible', text: 'Comparez la situation actuelle et la nouvelle offre, présentez les économies éventuelles et ajustez les paramètres de rentabilité selon votre configuration.' },
              ].map((benefit) => (
                <article key={benefit.title} className="border-t-2 border-blue-600 pt-6">
                  <benefit.icon className="size-7 text-blue-600" aria-hidden="true" />
                  <h3 className="mt-5 text-xl font-semibold tracking-tight">{benefit.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{benefit.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="demo" aria-labelledby="demo-title" className="scroll-mt-20 bg-[#edf3ff] py-20 sm:py-28">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="mb-10 text-center">
              <p className="mb-4 text-sm font-bold uppercase tracking-widest text-[#2f6fe9]">Proboost en 1 min 12</p>
              <h2 id="demo-title" className="text-balance text-[clamp(2.25rem,4vw,4.25rem)] font-bold leading-[1.02] tracking-[-0.04em] text-slate-950">
                Découvrez Proboost en action
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-8 text-slate-600">
                De la lecture des factures opérateurs à votre document commercial : découvrez l’analyse, le catalogue, les marges et les variantes en 1 min 12.
              </p>
            </div>
            <TutorialVideo />
            <div className="mt-8 text-center">
              <a href="#contact" className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#3d7eff] px-6 py-3 font-bold text-white transition-colors hover:bg-[#2f6fe9] ${focusRing}`}>
                Demander une démonstration
                <ArrowRight className="size-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
        <p className="bg-[#edf3ff] px-4 pb-8 text-center text-sm leading-6 text-slate-600">Présentation animée du parcours en téléphonie. Les visuels et les données sont illustratifs.</p>

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
            <div><p className={eyebrow}>Avant de démarrer</p><h2 id="faq-title" className={`mt-4 ${sectionTitle}`}>Vos questions avant de démarrer.</h2></div>
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
              <p className={eyebrow}>Demander une démonstration</p>
              <h2 className={`mt-4 ${sectionTitle}`}>Et si votre prochaine proposition<br />vous prenait moins de temps ?</h2>
              <p className="mt-6 max-w-lg text-lg leading-8 text-slate-600">Montrez-nous les modèles Word ou Excel que vous utilisez déjà. Nous vous présentons comment Proboost peut les remplir à partir de vos dossiers et accompagner votre équipe.</p>
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
