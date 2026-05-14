ALTER TABLE catalogues_produits
ADD COLUMN IF NOT EXISTS mode_fas VARCHAR(32)
DEFAULT 'fixe_par_selection'
CHECK (mode_fas IN ('fixe_par_selection', 'multiplie_par_quantite'));

UPDATE catalogues_produits
SET mode_fas = 'fixe_par_selection'
WHERE mode_fas IS NULL;

ALTER TABLE catalogues_produits
ALTER COLUMN mode_fas SET DEFAULT 'fixe_par_selection';
