'use client';

import Image from 'next/image';
import { Expand } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface ProductScreenshotProps {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
  priority?: boolean;
}

export function ProductScreenshot({ src, alt, caption, width, height, priority = false }: ProductScreenshotProps) {
  return (
    <figure className="min-w-0">
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label={`Agrandir : ${alt}`}
            className="group relative block w-full cursor-zoom-in overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-[0_20px_60px_-20px_rgba(15,23,42,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-4"
          >
            <Image src={src} alt={alt} width={width} height={height} priority={priority} unoptimized className="h-auto w-full" />
            <span className="absolute bottom-3 right-3 flex size-10 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-700 shadow-sm transition-colors group-hover:bg-blue-50 group-hover:text-blue-700" aria-hidden="true">
              <Expand className="size-4" />
            </span>
          </button>
        </DialogTrigger>
        <DialogContent className="max-h-[95dvh] w-[calc(100%-1rem)] max-w-7xl overflow-y-auto rounded-xl bg-white p-4 text-slate-950 [color-scheme:light] sm:p-6">
          <DialogHeader className="pr-6 text-left">
            <DialogTitle>{alt}</DialogTitle>
            <DialogDescription>{caption}</DialogDescription>
          </DialogHeader>
          <Image src={src} alt={alt} width={width} height={height} unoptimized className="h-auto w-full rounded-lg border border-slate-200" />
        </DialogContent>
      </Dialog>
      <figcaption className="mt-4 text-xs leading-5 text-slate-500">{caption}</figcaption>
    </figure>
  );
}
