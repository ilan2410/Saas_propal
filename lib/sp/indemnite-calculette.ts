export interface CalculetteMontants {
  mensuel: number;
  fraisFixes: number;
  penalites: number;
  fraisMateriel: number;
  servicesAnnexes: number;
}

export function calculerIndemnite(moisRestants: number | null, montants: CalculetteMontants) {
  const lignes = [
    ...(moisRestants === null ? [] : [{
      libelle: 'Mensualités restantes',
      calcul: `${montants.mensuel.toFixed(2)} € × ${moisRestants} mois`,
      montant: moisRestants * montants.mensuel,
    }]),
    ...([
      ['Frais fixes de résiliation', montants.fraisFixes],
      ['Pénalités', montants.penalites],
      ['Frais matériel', montants.fraisMateriel],
      ['Services annexes', montants.servicesAnnexes],
    ] as const)
      .filter(([, montant]) => montant !== 0)
      .map(([libelle, montant]) => ({ libelle, calcul: null, montant })),
  ];

  return {
    lignes,
    total: (moisRestants ?? 0) * montants.mensuel
      + montants.fraisFixes + montants.penalites + montants.fraisMateriel + montants.servicesAnnexes,
  };
}
