import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CatalogueCategorie } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { products, is_global } = await request.json();

    if (!Array.isArray(products)) {
      return NextResponse.json({ error: 'Format invalide' }, { status: 400 });
    }

    // Vérifier le rôle admin si is_global est demandé
    const role = user.user_metadata?.role;
    const isGlobalImport = is_global === true && role === 'admin';

    let successCount = 0;
    const errors: string[] = [];

    // Valid categories
    const validCategories: CatalogueCategorie[] = ['mobile', 'internet', 'fixe', 'cloud', 'equipement', 'autre', 'cadeau', 'installation'];

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const rowNum = i + 1;

      // Basic Validation
      if (!p.nom) {
        errors.push(`Ligne ${rowNum}: Nom manquant`);
        continue;
      }

      // Clean/Normalize data
      const categorie = validCategories.includes(p.categorie?.toLowerCase()) 
        ? p.categorie.toLowerCase() 
        : 'autre';
      
      const type_frequence = p.type_frequence === 'unique' ? 'unique' : 'mensuel';
      const mode_fas = p.mode_fas === 'multiplie_par_quantite' ? 'multiplie_par_quantite' : 'fixe_par_selection';

      // Parse numbers
      const prix_mensuel = p.prix_mensuel ? parseFloat(String(p.prix_mensuel).replace(',', '.')) : null;
      const prix_vente = p.prix_vente ? parseFloat(String(p.prix_vente).replace(',', '.')) : null;
      const prix_installation = p.prix_installation ? parseFloat(String(p.prix_installation).replace(',', '.')) : null;
      const engagement_mois = p.engagement_mois ? parseInt(String(p.engagement_mois)) : null;

      // Tags
      const tags = typeof p.tags === 'string'
        ? p.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
        : [];

      const remise_valeur = p.remise_valeur ? parseFloat(String(p.remise_valeur).replace(',', '.')) : null;
      const remise_type = (p.remise_type === 'fixe' || p.remise_type === 'pourcentage') ? p.remise_type : null;

      const actif = p.actif !== undefined && p.actif !== null
        ? !['false', '0', 'non', 'no'].includes(String(p.actif).toLowerCase().trim())
        : true;

      const parseBool = (val: unknown) => {
        if (val === undefined || val === null) return true;
        const s = String(val).toLowerCase().trim();
        return !(s === 'false' || s === '0' || s === 'non' || s === 'no');
      };
      const destinations = {
        proposition: parseBool(p.destinations_proposition ?? p.proposition),
        bdc_operateur: parseBool(p.destinations_bdc_operateur ?? p.bdc_operateur),
        bdc_materiel: parseBool(p.destinations_bdc_materiel ?? p.bdc_materiel),
      };

      // Check duplicate
      const orgId = isGlobalImport ? null : user.id;
      const { data: existing } = await supabase
        .from('catalogues_produits')
        .select('id')
        .eq('nom', p.nom)
        .eq('organization_id', orgId)
        .maybeSingle();

      if (existing) {
        errors.push(`Ligne ${rowNum}: Doublon ignoré — le produit "${p.nom}" existe déjà`);
        continue;
      }

      try {
        const { error } = await supabase.from('catalogues_produits').insert({
          organization_id: isGlobalImport ? null : user.id,
          nom: p.nom,
          categorie,
          description: p.description || null,
          fournisseur: p.fournisseur || null,
          type_frequence,
          mode_fas,
          prix_mensuel,
          remise_type,
          remise_valeur,
          prix_vente,
          prix_installation,
          engagement_mois,
          image_url: p.image_url || null,
          tags,
          caracteristiques: {}, // Default empty
          est_produit_base: false,
          actif,
          destinations,
        });

        if (error) {
          errors.push(`Ligne ${rowNum}: ${error.message}`);
        } else {
          successCount++;
        }
      } catch (err) {
        errors.push(`Ligne ${rowNum}: Erreur serveur`);
      }
    }

    return NextResponse.json({ success: true, count: successCount, errors });

  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de l\'importation' }, { status: 500 });
  }
}
