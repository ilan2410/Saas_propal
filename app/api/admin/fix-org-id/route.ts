import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

// POST /api/admin/fix-org-id
// Corrige les organisations dont l'ID ne correspond pas à l'ID Auth de l'utilisateur
export async function POST(request: NextRequest) {
  try {
    // Vérifier que l'appelant est admin
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user || user.user_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const supabaseAdmin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Récupérer toutes les organisations
    const { data: organizations } = await supabaseAdmin
      .from('organizations')
      .select('*');

    // Récupérer tous les utilisateurs Auth
    const { data: authData } = await supabaseAdmin.auth.admin.listUsers();
    const authUsers = authData?.users || [];

    const fixes: any[] = [];
    const errors: any[] = [];

    for (const org of organizations || []) {
      // Trouver l'utilisateur Auth correspondant par email
      const authUser = authUsers.find(u => u.email === org.email);
      
      if (authUser && authUser.id !== org.id) {
        // L'ID ne correspond pas, il faut corriger
        console.log(`Fixing org ${org.email}: ${org.id} -> ${authUser.id}`);
        
        // Supprimer l'ancienne organisation
        const { error: deleteError } = await supabaseAdmin
          .from('organizations')
          .delete()
          .eq('id', org.id);

        if (deleteError) {
          errors.push({ email: org.email, error: deleteError.message, step: 'delete' });
          continue;
        }

        // Créer la nouvelle avec le bon ID
        const { data: newOrg, error: insertError } = await supabaseAdmin
          .from('organizations')
          .insert({
            ...org,
            id: authUser.id, // Utiliser l'ID Auth
          })
          .select()
          .single();

        if (insertError) {
          errors.push({ email: org.email, error: insertError.message, step: 'insert' });
          continue;
        }

        fixes.push({
          email: org.email,
          oldId: org.id,
          newId: authUser.id,
          credits: newOrg.credits,
        });
      }
    }

    return NextResponse.json({
      success: true,
      fixed: fixes.length,
      fixes,
      errors,
    });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Erreur serveur',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
