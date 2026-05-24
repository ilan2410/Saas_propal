import type { CatalogueProduit } from '@/types';

export interface PrixResolu {
  prix_vente: number | null;
  prix_mensuel: number | null;
  prix_installation: number | null;
  tranche_active: boolean;
  tranche_label: string | null;
}

export function resolvePrixPourQuantite(
  produit: CatalogueProduit,
  quantite: number,
): PrixResolu {
  const tranches = produit.prix_par_tranche;

  if (tranches && tranches.length > 0) {
    const tranche = tranches.find(
      (t) => quantite >= t.qte_min && (t.qte_max === null || quantite <= t.qte_max),
    );

    if (tranche) {
      const max = tranche.qte_max === null ? '∞' : String(tranche.qte_max);
      return {
        prix_vente: tranche.prix_vente ?? produit.prix_vente ?? null,
        prix_mensuel: tranche.prix_mensuel ?? produit.prix_mensuel ?? null,
        prix_installation: tranche.prix_installation ?? produit.prix_installation ?? null,
        tranche_active: true,
        tranche_label: `qté ${tranche.qte_min}–${max}`,
      };
    }
  }

  return {
    prix_vente: produit.prix_vente ?? null,
    prix_mensuel: produit.prix_mensuel ?? null,
    prix_installation: produit.prix_installation ?? null,
    tranche_active: false,
    tranche_label: null,
  };
}
