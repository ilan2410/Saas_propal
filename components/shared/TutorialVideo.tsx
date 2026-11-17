'use client';

import { useRef, useState } from 'react';
import { Play } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function TutorialVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  async function play() {
    setStarted(true);
    try {
      await videoRef.current?.play();
    } catch {
      // Les contrôles natifs restent disponibles si le navigateur bloque la lecture.
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-[#07111f] shadow-[0_24px_64px_rgba(7,17,31,0.18)]">
      <video
        ref={videoRef}
        className="aspect-video w-full"
        controls={started}
        playsInline
        preload="none"
        poster="/videos/proboost-tutoriel-poster.jpg"
        aria-label="Tutoriel Proboost : de la facture client à la proposition commerciale, 1 minute 38"
      >
        <source src="/videos/proboost-tutoriel.mp4" type="video/mp4" />
        Votre navigateur ne prend pas en charge la vidéo.{' '}
        <a href="/videos/proboost-tutoriel.mp4">Télécharger le tutoriel</a>.
      </video>
      {!started && (
        <button
          type="button"
          onClick={play}
          aria-label="Lire la démonstration Proboost, 1 minute 38"
          className="group absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/20 text-white transition-colors hover:bg-black/35 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[#78a9ff]"
        >
          <span className="flex size-16 items-center justify-center rounded-full bg-[#3d7eff] shadow-lg transition-transform group-hover:scale-105 sm:size-20">
            <Play className="ml-1 size-7 fill-current sm:size-8" aria-hidden="true" />
          </span>
          <span className="rounded-full bg-[#07111f]/90 px-4 py-2 text-sm font-semibold">
            Voir la démo · 1 min 38
          </span>
        </button>
      )}
    </div>
  );
}

export function TutorialVideoDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-2 rounded text-sm font-medium text-blue-700 hover:text-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <Play className="size-4" aria-hidden="true" />
          Voir le tutoriel · 1 min 38
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-5xl overflow-y-auto rounded-xl bg-white p-4 sm:p-6">
        <DialogHeader className="pr-6">
          <DialogTitle>Découvrez Proboost en action</DialogTitle>
          <DialogDescription>
            De la facture client à la proposition commerciale en 1 min 38.
          </DialogDescription>
        </DialogHeader>
        <TutorialVideo />
      </DialogContent>
    </Dialog>
  );
}
