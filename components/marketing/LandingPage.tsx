import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Database,
  FileCheck2,
  FileInput,
  FileText,
  Layers3,
  LockKeyhole,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  WandSparkles,
  Zap,
} from 'lucide-react';

const workflow = [
  {
    icon: FileInput,
    title: 'Rassemblez les pièces du dossier',
    description:
      'Ajoutez les documents du client dans un espace unique, puis sélectionnez le modèle adapté à votre offre.',
    detail: 'Factures, contrats et informations client',
  },
  {
    icon: WandSparkles,
    title: 'Contrôlez les données utiles',
    description:
      'Proboost structure les informations détectées et vous laisse les vérifier avant de construire la proposition.',
    detail: 'Extraction assistée, validation commerciale',
  },
  {
    icon: FileCheck2,
    title: 'Finalisez et suivez la proposition',
    description:
      'Complétez l’offre, générez votre document et conservez son statut, ses notes et ses prochaines actions au même endroit.',
    detail: 'Génération, statuts et suivi d’activité',
  },
];

const capabilities = [
  {
    icon: Layers3,
    title: 'Vos modèles, votre méthode',
    description:
      'Chaque organisation travaille avec ses propres modèles, champs et règles de préparation.',
  },
  {
    icon: Database,
    title: 'Un catalogue directement exploitable',
    description:
      'Retrouvez les produits et paramètres nécessaires sans reconstruire l’offre à chaque dossier.',
  },
  {
    icon: Users,
    title: 'Un espace partagé par l’équipe',
    description:
      'Les propositions, modèles et informations restent disponibles pour les personnes autorisées.',
  },
  {
    icon: BarChart3,
    title: 'Une activité facile à piloter',
    description:
      'Suivez les propositions en cours, leur statut et les actions à mener depuis un tableau de bord dédié.',
  },
];

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#78a9ff] focus-visible:ring-offset-2';

export function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f5f7fb] font-[family-name:var(--font-geist-sans)] text-slate-950 selection:bg-[#b9d2ff] selection:text-[#07111f]">
      <a
        href="#contenu"
        className={`sr-only z-50 rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 ${focusRing}`}
      >
        Aller au contenu
      </a>

      <header className="relative z-40 border-b border-white/10 bg-[#07111f]">
        <nav
          aria-label="Navigation principale"
          className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"
        >
          <Link href="/" aria-label="Accueil Proboost" className={`flex items-center gap-2.5 rounded-lg ${focusRing}`}>
            <span className="flex size-10 items-center justify-center rounded-xl bg-white shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
              <Image src="/logo.png" alt="" width={32} height={32} priority />
            </span>
            <span className="text-lg font-bold tracking-[-0.02em] text-white">Proboost</span>
          </Link>

          <div className="hidden items-center gap-8 text-sm font-medium text-[#bac8dc] lg:flex">
            <a href="#workflow" className={`rounded hover:text-white ${focusRing}`}>
              Le workflow
            </a>
            <a href="#sa-sp" className={`rounded hover:text-white ${focusRing}`}>
              Situation SA / SP
            </a>
            <a href="#fonctionnalites" className={`rounded hover:text-white ${focusRing}`}>
              Fonctionnalités
            </a>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className={`hidden rounded-lg px-3 py-2 text-sm font-semibold text-[#d6e1ef] transition-colors hover:bg-white/8 hover:text-white sm:inline-flex ${focusRing}`}
            >
              Se connecter
            </Link>
            <Link
              href="/register"
              className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#3d7eff] px-3.5 py-2 text-sm font-bold text-white shadow-[0_8px_24px_rgba(61,126,255,0.28)] transition-colors hover:bg-[#2f6fe9] sm:px-4 ${focusRing}`}
            >
              <span className="sm:hidden">Essayer</span>
              <span className="hidden sm:inline">Créer un compte</span>
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </nav>
      </header>

      <main id="contenu">
        <section className="relative isolate overflow-hidden bg-[#07111f] text-white">
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 opacity-80 [background-image:linear-gradient(rgba(120,169,255,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(120,169,255,0.055)_1px,transparent_1px)] [background-size:64px_64px]"
          />
          <div
            aria-hidden="true"
            className="absolute -right-36 top-8 -z-10 size-[34rem] rounded-full bg-[#245fce]/20 blur-3xl"
          />
          <div className="mx-auto grid min-h-[720px] max-w-7xl items-center gap-14 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-28">
            <div className="relative z-10 max-w-2xl">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#78a9ff]/30 bg-[#0d1b2f] px-3 py-1.5 text-sm font-medium text-[#c9d9ee]">
                <Radio className="size-4 text-[#58e0b2]" aria-hidden="true" />
                Conçu pour les équipes commerciales télécom
              </div>
              <h1 className="max-w-[12ch] text-balance text-[clamp(2.85rem,6.5vw,5.75rem)] font-bold leading-[0.96] tracking-[-0.04em]">
                De vos pièces client à une proposition prête à avancer.
              </h1>
              <p className="mt-7 max-w-[62ch] text-pretty text-lg leading-8 text-[#b9c9dd] sm:text-xl">
                Proboost réunit l’extraction, la préparation de l’offre, la génération et le suivi dans un seul workflow. Moins de ressaisie, plus de maîtrise à chaque étape.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/register"
                  className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#3d7eff] px-6 py-3 font-bold text-white shadow-[0_14px_36px_rgba(61,126,255,0.32)] transition-colors hover:bg-[#2f6fe9] ${focusRing}`}
                >
                  Créer mon espace
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
                <a
                  href="#produit"
                  className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/[0.04] px-6 py-3 font-semibold text-white transition-colors hover:border-white/35 hover:bg-white/[0.08] ${focusRing}`}
                >
                  Voir le workflow
                  <ChevronRight className="size-4" aria-hidden="true" />
                </a>
              </div>
              <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm text-[#afc0d5]">
                {['Contrôle avant génération', 'Espace par organisation', 'Suivi centralisé'].map((item) => (
                  <span key={item} className="inline-flex items-center gap-2">
                    <Check className="size-4 text-[#58e0b2]" aria-hidden="true" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[680px] lg:mx-0">
              <div aria-hidden="true" className="absolute -inset-10 -z-10 bg-[radial-gradient(circle,rgba(61,126,255,0.22),transparent_66%)]" />
              <div className="overflow-hidden rounded-[1.35rem] border border-white/15 bg-[#0b1727] shadow-[0_32px_80px_rgba(0,0,0,0.42)]">
                <div className="flex h-12 items-center justify-between border-b border-white/10 px-4">
                  <div className="flex gap-1.5" aria-hidden="true">
                    <span className="size-2.5 rounded-full bg-[#ff6b6b]" />
                    <span className="size-2.5 rounded-full bg-[#ffd166]" />
                    <span className="size-2.5 rounded-full bg-[#58e0b2]" />
                  </div>
                  <div className="flex items-center gap-2 text-xs font-medium text-[#8da4bf]">
                    <LockKeyhole className="size-3.5" aria-hidden="true" />
                    espace.proboost
                  </div>
                  <span className="w-12" aria-hidden="true" />
                </div>

                <div className="grid min-h-[450px] grid-cols-[68px_1fr] sm:grid-cols-[150px_1fr]">
                  <aside className="border-r border-white/10 bg-[#081320] p-3 sm:p-4" aria-label="Aperçu de la navigation produit">
                    <div className="mb-7 flex items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-white">
                        <Image src="/logo.png" alt="" width={22} height={22} />
                      </span>
                      <span className="hidden text-xs font-bold sm:inline">Proboost</span>
                    </div>
                    <div className="space-y-2 text-xs text-[#8da4bf]">
                      <div className="flex items-center gap-2 rounded-md px-2 py-2">
                        <BarChart3 className="size-4 shrink-0" aria-hidden="true" />
                        <span className="hidden sm:inline">Tableau de bord</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-md bg-[#17335f] px-2 py-2 font-semibold text-white">
                        <FileText className="size-4 shrink-0 text-[#78a9ff]" aria-hidden="true" />
                        <span className="hidden sm:inline">Propositions</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-md px-2 py-2">
                        <Layers3 className="size-4 shrink-0" aria-hidden="true" />
                        <span className="hidden sm:inline">Modèles</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-md px-2 py-2">
                        <Database className="size-4 shrink-0" aria-hidden="true" />
                        <span className="hidden sm:inline">Catalogue</span>
                      </div>
                    </div>
                  </aside>

                  <div className="min-w-0 bg-[#f6f8fc] p-4 text-slate-950 sm:p-6">
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                      <div>
                        <p className="text-xs font-medium text-slate-500">Aperçu du workflow · dossier de démonstration</p>
                        <h2 className="mt-1 text-lg font-bold tracking-[-0.02em] sm:text-xl">Dossier Horizon Télécom</h2>
                      </div>
                      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                        <CircleDot className="size-3" aria-hidden="true" />
                        En préparation
                      </span>
                    </div>

                    <div className="mt-6 hidden items-center sm:flex" aria-label="Progression de la proposition">
                      {['Modèle', 'Documents', 'Données', 'Offre', 'Génération'].map((step, index) => (
                        <div key={step} className="flex flex-1 items-center last:flex-none">
                          <span className={`flex size-6 items-center justify-center rounded-full text-[11px] font-bold ${index < 3 ? 'bg-[#3d7eff] text-white' : 'border border-slate-300 bg-white text-slate-500'}`}>
                            {index < 2 ? <Check className="size-3" aria-hidden="true" /> : index + 1}
                          </span>
                          {index < 4 && <span className={`h-px flex-1 ${index < 2 ? 'bg-[#3d7eff]' : 'bg-slate-300'}`} />}
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-[1.1fr_0.9fr]">
                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.06)]">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="flex size-9 items-center justify-center rounded-lg bg-blue-50 text-[#2f6fe9]">
                              <FileText className="size-4" aria-hidden="true" />
                            </span>
                            <div>
                              <p className="text-sm font-semibold">Facture opérateur.pdf</p>
                              <p className="text-xs text-slate-500">Document analysé</p>
                            </div>
                          </div>
                          <CheckCircle2 className="size-5 shrink-0 text-emerald-500" aria-label="Analyse terminée" />
                        </div>
                        <div className="mt-5 space-y-3">
                          {[
                            ['Client', 'Horizon Télécom'],
                            ['Période', 'Janvier 2026'],
                            ['Lignes détectées', '24 lignes'],
                          ].map(([label, value]) => (
                            <div key={label} className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2 text-xs last:border-0">
                              <span className="text-slate-500">{label}</span>
                              <span className="font-semibold text-slate-800">{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl bg-[#0d1b2f] p-4 text-white shadow-[0_14px_30px_rgba(7,17,31,0.18)]">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-[#9eb3cb]">Étape active</span>
                          <Zap className="size-4 text-[#58e0b2]" aria-hidden="true" />
                        </div>
                        <p className="mt-3 text-lg font-bold">Vérifier les données</p>
                        <p className="mt-2 text-xs leading-5 text-[#aebfd3]">
                          Les informations restent modifiables avant la construction de l’offre.
                        </p>
                        <div className="mt-5 flex items-center gap-2 rounded-lg bg-[#17335f] px-3 py-2.5 text-xs font-semibold text-[#dce9f8]">
                          Continuer vers l’offre
                          <ArrowRight className="ml-auto size-3.5" aria-hidden="true" />
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-2 overflow-hidden rounded-lg border border-[#3d7eff]/20 bg-[#eaf1ff] px-3 py-2 text-xs font-medium text-[#2456b5]">
                      <Sparkles className="size-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">Le dossier avance sans quitter votre espace commercial.</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute -bottom-5 -left-2 hidden items-center gap-3 rounded-xl border border-white/10 bg-[#10223b] px-4 py-3 text-white shadow-[0_18px_40px_rgba(0,0,0,0.28)] sm:flex lg:-left-8">
                <span className="flex size-9 items-center justify-center rounded-lg bg-[#58e0b2]/15 text-[#58e0b2]">
                  <CheckCircle2 className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs text-[#96abc3]">Signal reçu</p>
                  <p className="text-sm font-semibold">Données prêtes à vérifier</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-slate-200 bg-white" aria-label="Les trois temps du workflow">
          <div className="mx-auto grid max-w-7xl divide-y divide-slate-200 px-4 sm:px-6 md:grid-cols-3 md:divide-x md:divide-y-0 lg:px-8">
            {[
              ['01', 'Entrée', 'Documents et contexte client'],
              ['02', 'Traitement', 'Extraction, contrôle et offre'],
              ['03', 'Sortie', 'Proposition et suivi commercial'],
            ].map(([number, title, description]) => (
              <div key={title} className="flex items-start gap-4 py-6 md:px-7 md:first:pl-0 md:last:pr-0">
                <span className="font-mono text-xs font-bold tabular-nums text-[#2f6fe9]">{number}</span>
                <div>
                  <h2 className="text-sm font-bold text-slate-950">{title}</h2>
                  <p className="mt-1 text-sm text-slate-600">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="workflow" className="scroll-mt-20 bg-white py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <h2 className="text-balance text-[clamp(2.25rem,4vw,4.25rem)] font-bold leading-[1.02] tracking-[-0.04em] text-slate-950">
                Un fil continu, du dossier client à l’action commerciale.
              </h2>
              <p className="mt-6 max-w-[66ch] text-pretty text-lg leading-8 text-slate-600">
                Au lieu de disperser la préparation entre fichiers, outils et relances, Proboost organise chaque proposition autour d’un chemin lisible et contrôlable.
              </p>
            </div>

            <div className="mt-16 border-y border-slate-200">
              {workflow.map((step, index) => (
                <article key={step.title} className="grid gap-6 border-b border-slate-200 py-9 last:border-b-0 md:grid-cols-[80px_1fr_1fr] md:items-start md:gap-10 md:py-12">
                  <div className="flex items-center justify-between md:block">
                    <span className="font-mono text-sm font-bold tabular-nums text-[#2f6fe9]">0{index + 1}</span>
                    <span className="flex size-11 items-center justify-center rounded-xl bg-[#eaf1ff] text-[#2f6fe9] md:mt-7">
                      <step.icon className="size-5" aria-hidden="true" />
                    </span>
                  </div>
                  <h3 className="max-w-[19ch] text-balance text-2xl font-bold tracking-[-0.03em] text-slate-950 sm:text-3xl">
                    {step.title}
                  </h3>
                  <div>
                    <p className="max-w-[58ch] leading-7 text-slate-600">{step.description}</p>
                    <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <Radio className="size-4 text-[#2f6fe9]" aria-hidden="true" />
                      {step.detail}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="sa-sp" className="relative isolate scroll-mt-20 overflow-hidden bg-[#07111f] py-24 text-white sm:py-32">
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 opacity-60 [background-image:linear-gradient(rgba(120,169,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(120,169,255,0.045)_1px,transparent_1px)] [background-size:64px_64px]"
          />
          <div aria-hidden="true" className="absolute -left-48 top-1/3 -z-10 size-[32rem] rounded-full bg-amber-500/8 blur-3xl" />
          <div aria-hidden="true" className="absolute -right-48 bottom-0 -z-10 size-[36rem] rounded-full bg-[#3d7eff]/15 blur-3xl" />

          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-end">
              <h2 className="max-w-[16ch] text-balance text-[clamp(2.4rem,5vw,5rem)] font-bold leading-[0.98] tracking-[-0.04em]">
                De la situation actuelle à une proposition qui se défend.
              </h2>
              <p className="max-w-[62ch] text-pretty text-lg leading-8 text-[#afc0d5] lg:justify-self-end">
                Proboost transforme les documents du client en une base commerciale vérifiable, puis vous aide à construire et comparer une nouvelle offre avant de la présenter.
              </p>
            </div>

            <div className="mt-16 grid items-stretch gap-5 lg:grid-cols-[1fr_180px_1fr] lg:gap-0">
              <article className="relative overflow-hidden rounded-[1.4rem] border border-amber-300/20 bg-[#16191f] p-7 shadow-[0_24px_60px_rgba(0,0,0,0.24)] sm:p-9 lg:rounded-r-none">
                <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-amber-400" />
                <div className="flex items-center justify-between gap-4">
                  <span className="inline-flex items-center gap-2 rounded-full bg-amber-400/10 px-3 py-1.5 text-sm font-semibold text-amber-200">
                    <Database className="size-4" aria-hidden="true" />
                    Situation actuelle · SA
                  </span>
                  <span className="font-mono text-xs font-bold text-amber-300/70">EXISTANT</span>
                </div>
                <h3 className="mt-8 max-w-[15ch] text-balance text-3xl font-bold tracking-[-0.035em] sm:text-4xl">
                  Comprendre ce que le client a aujourd’hui.
                </h3>
                <p className="mt-5 max-w-[58ch] leading-7 text-[#b8c4d3]">
                  La plateforme analyse ses factures et contrats pour faire ressortir les services, les équipements, les engagements et le coût de son installation actuelle.
                </p>
                <ul className="mt-8 space-y-3 border-t border-white/10 pt-6 text-sm text-[#d5deea]">
                  {[
                    'Fixe, mobile, internet et abonnements',
                    'Matériel, locations et engagements',
                    'Données vérifiables et corrigeables',
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-3">
                      <span className="size-1.5 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>

              <div className="relative flex min-h-40 items-center justify-center py-3 lg:min-h-0 lg:py-0" aria-label="Transformation par Proboost">
                <div aria-hidden="true" className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gradient-to-b from-amber-400 via-[#78a9ff] to-[#58e0b2] lg:left-0 lg:top-1/2 lg:h-px lg:w-full lg:-translate-x-0 lg:-translate-y-1/2 lg:bg-gradient-to-r" />
                <div className="relative z-10 w-full max-w-[180px] rounded-2xl border border-white/15 bg-[#0d1b2f] px-4 py-5 text-center shadow-[0_18px_42px_rgba(0,0,0,0.28)]">
                  <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-white">
                    <Image src="/logo.png" alt="" width={34} height={34} />
                  </span>
                  <p className="mt-3 text-sm font-bold">Proboost relie les deux</p>
                  <p className="mt-2 text-xs leading-5 text-[#91a7c0]">Extraction, vos questions et vos règles métier</p>
                </div>
              </div>

              <article className="relative overflow-hidden rounded-[1.4rem] border border-[#78a9ff]/25 bg-[#0d1b2f] p-7 shadow-[0_24px_60px_rgba(0,0,0,0.24)] sm:p-9 lg:rounded-l-none">
                <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-[#58e0b2]" />
                <div className="flex items-center justify-between gap-4">
                  <span className="inline-flex items-center gap-2 rounded-full bg-[#58e0b2]/10 px-3 py-1.5 text-sm font-semibold text-[#83edc9]">
                    <Sparkles className="size-4" aria-hidden="true" />
                    Situation proposée · SP
                  </span>
                  <span className="font-mono text-xs font-bold text-[#78a9ff]/80">NOUVELLE OFFRE</span>
                </div>
                <h3 className="mt-8 max-w-[15ch] text-balance text-3xl font-bold tracking-[-0.035em] sm:text-4xl">
                  Construire la suite avec des choix maîtrisés.
                </h3>
                <p className="mt-5 max-w-[58ch] leading-7 text-[#b8cbe0]">
                  Vous conservez les modèles que votre équipe utilise déjà et construisez votre propre questionnaire SP. Proboost applique ensuite votre catalogue et vos règles pour chiffrer et comparer l’offre.
                </p>
                <ul className="mt-8 space-y-3 border-t border-white/10 pt-6 text-sm text-[#dce7f4]">
                  {[
                    'Vos modèles commerciaux habituels, intégrés à la plateforme',
                    'Vos propres questions SP, adaptées à votre méthode de vente',
                    'Coût proposé et écart avec l’existant clairement comparés',
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-3">
                      <Check className="size-4 shrink-0 text-[#58e0b2]" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            </div>

            <div className="mt-5 grid overflow-hidden rounded-[1.25rem] border border-white/10 bg-white/[0.035] sm:grid-cols-3">
              {[
                ['Comprendre', 'Une vision fiable de l’existant, sans ressaisie dispersée.'],
                ['Argumenter', 'Une comparaison claire pour expliquer chaque choix au client.'],
                ['Produire', 'Une proposition cohérente et un comparatif exportable en Word ou Excel.'],
              ].map(([title, description]) => (
                <div key={title} className="border-b border-white/10 p-6 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
                  <p className="font-bold text-white">{title}</p>
                  <p className="mt-2 text-sm leading-6 text-[#9fb2c9]">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="produit" className="scroll-mt-20 bg-[#dfeaff] py-24 sm:py-32">
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[0.82fr_1.18fr] lg:px-8">
            <div>
              <h2 className="max-w-[13ch] text-balance text-[clamp(2.25rem,4vw,4.25rem)] font-bold leading-[1.02] tracking-[-0.04em] text-[#07111f]">
                La vitesse, sans perdre le contrôle.
              </h2>
              <p className="mt-6 max-w-[60ch] text-pretty text-lg leading-8 text-[#30445f]">
                L’automatisation prépare le terrain. Le commercial garde la main sur les données, l’offre et le moment où la proposition est générée.
              </p>
              <ul className="mt-8 space-y-4">
                {[
                  'Une progression visible à chaque étape',
                  'Des informations vérifiables et modifiables',
                  'Un historique exploitable après la génération',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-[#1d304a]">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#07111f] text-white">
                      <Check className="size-3.5" aria-hidden="true" />
                    </span>
                    <span className="font-medium leading-6">{item}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/register"
                className={`mt-9 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#07111f] px-6 py-3 font-bold text-white transition-colors hover:bg-[#13263f] ${focusRing}`}
              >
                Découvrir Proboost
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>

            <div className="overflow-hidden rounded-[1.4rem] border border-[#7793bc]/30 bg-white shadow-[0_28px_70px_rgba(31,63,108,0.2)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-6">
                <div>
                  <p className="text-xs font-medium text-slate-500">Aperçu de l’interface</p>
                  <p className="mt-0.5 font-bold text-slate-950">Dossiers de démonstration</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative hidden sm:block">
                    <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                    <span className="block rounded-lg border border-slate-200 py-2 pl-9 pr-12 text-xs text-slate-400">Rechercher</span>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#3d7eff] px-3 py-2 text-xs font-bold text-white">
                    <Sparkles className="size-3.5" aria-hidden="true" />
                    Nouvelle
                  </span>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {[
                  ['Nova Connect', 'Forfait mobile entreprise', 'À relancer', 'bg-amber-100 text-amber-800'],
                  ['Atelier Mercure', 'Renouvellement flotte', 'Envoyée', 'bg-blue-100 text-blue-800'],
                  ['Groupe Lumen', 'Lignes & terminaux', 'Acceptée', 'bg-emerald-100 text-emerald-800'],
                  ['Cabinet Rivage', 'Téléphonie multisite', 'En préparation', 'bg-slate-100 text-slate-700'],
                ].map(([client, template, status, statusClass], index) => (
                  <div key={client} className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:px-6">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{client}</p>
                      <p className="mt-0.5 text-xs text-slate-500 sm:hidden">{template}</p>
                    </div>
                    <p className="hidden text-sm text-slate-500 sm:block">{template}</p>
                    <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}`}>{status}</span>
                    <span className="hidden font-mono text-xs tabular-nums text-slate-400 md:block">{12 + index}/09</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between bg-[#f8faff] px-5 py-4 text-xs sm:px-6">
                <span className="font-medium text-slate-500">Tous les dossiers restent accessibles à l’équipe</span>
                <span className="hidden items-center gap-1 font-bold text-[#2f6fe9] sm:inline-flex">
                  Voir les propositions
                  <ChevronRight className="size-3.5" aria-hidden="true" />
                </span>
              </div>
            </div>
          </div>
        </section>

        <section id="fonctionnalites" className="scroll-mt-20 bg-[#f5f7fb] py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
              <div>
                <h2 className="text-balance text-[clamp(2.25rem,4vw,4rem)] font-bold leading-[1.04] tracking-[-0.04em] text-slate-950">
                  Une base solide pour industrialiser vos propositions.
                </h2>
                <p className="mt-6 max-w-[56ch] text-pretty text-lg leading-8 text-slate-600">
                  Proboost ne se limite pas à générer un document. Il structure les ressources, les rôles et le suivi nécessaires pour travailler de façon répétable.
                </p>
              </div>

              <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
                {capabilities.map((capability) => (
                  <article key={capability.title} className="border-t border-slate-300 pt-6">
                    <capability.icon className="size-6 text-[#2f6fe9]" aria-hidden="true" />
                    <h3 className="mt-5 text-xl font-bold tracking-[-0.02em] text-slate-950">{capability.title}</h3>
                    <p className="mt-3 leading-7 text-slate-600">{capability.description}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="mt-20 grid overflow-hidden rounded-[1.5rem] bg-[#07111f] text-white lg:grid-cols-[1.1fr_0.9fr]">
              <div className="p-7 sm:p-10 lg:p-14">
                <ShieldCheck className="size-8 text-[#58e0b2]" aria-hidden="true" />
                <h3 className="mt-8 max-w-[15ch] text-balance text-3xl font-bold tracking-[-0.035em] sm:text-4xl">
                  Un workflow rapide n’a pas besoin d’être une boîte noire.
                </h3>
                <p className="mt-5 max-w-[62ch] text-pretty leading-7 text-[#afc0d5]">
                  Chaque étape reste visible : les pièces utilisées, les données extraites, les choix commerciaux et l’état du dossier. Votre équipe avance plus vite tout en gardant un point de contrôle clair.
                </p>
              </div>
              <div className="border-t border-white/10 bg-[#0d1b2f] p-7 sm:p-10 lg:border-l lg:border-t-0 lg:p-14">
                <div className="space-y-6">
                  {[
                    ['Visibilité', 'Une progression explicite du dossier'],
                    ['Contrôle', 'Une validation avant la génération'],
                    ['Continuité', 'Des notes et statuts après l’envoi'],
                  ].map(([title, description]) => (
                    <div key={title} className="flex gap-4 border-b border-white/10 pb-6 last:border-0 last:pb-0">
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#58e0b2]" aria-hidden="true" />
                      <div>
                        <p className="font-bold">{title}</p>
                        <p className="mt-1 text-sm leading-6 text-[#9fb2c9]">{description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="relative isolate overflow-hidden bg-[#2768e3] py-24 text-white sm:py-28">
          <div aria-hidden="true" className="absolute inset-0 -z-10 opacity-25 [background-image:linear-gradient(rgba(255,255,255,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.16)_1px,transparent_1px)] [background-size:56px_56px]" />
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-10 px-4 sm:px-6 lg:flex-row lg:items-end lg:px-8">
            <div>
              <h2 className="max-w-[13ch] text-balance text-[clamp(2.5rem,5vw,5rem)] font-bold leading-[0.98] tracking-[-0.04em]">
                Faites avancer la prochaine proposition, pas la ressaisie.
              </h2>
              <p className="mt-6 max-w-[62ch] text-pretty text-lg leading-8 text-[#e0ebff]">
                Créez votre espace Proboost et retrouvez un workflow conçu pour la réalité des équipes commerciales télécom.
              </p>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-3 sm:w-auto sm:flex-row lg:flex-col">
              <Link
                href="/register"
                className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 font-bold text-[#174da9] shadow-[0_14px_36px_rgba(14,46,103,0.2)] transition-colors hover:bg-[#eef4ff] ${focusRing}`}
              >
                Créer mon compte
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link
                href="/login"
                className={`inline-flex min-h-12 items-center justify-center rounded-lg border border-white/30 px-6 py-3 font-semibold text-white transition-colors hover:bg-white/10 ${focusRing}`}
              >
                J’ai déjà un compte
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#07111f] px-4 py-10 text-[#9fb2c9] sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-white">
              <Image src="/logo.png" alt="" width={27} height={27} />
            </span>
            <div>
              <p className="font-bold text-white">Proboost</p>
              <p className="mt-0.5 text-xs">Propositions commerciales télécom</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            <Link href="/confidentialite" className={`rounded transition-colors hover:text-white ${focusRing}`}>
              Confidentialité
            </Link>
            <Link href="/cgu" className={`rounded transition-colors hover:text-white ${focusRing}`}>
              Conditions d’utilisation
            </Link>
            <span>© {new Date().getFullYear()} Livenot</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
