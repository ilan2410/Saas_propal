import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// PATCH - Mettre à jour le statut d'un template
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { statut } = await request.json();

    // Valider le statut
    const validStatuts = ['brouillon', 'teste', 'actif'];
    if (!validStatuts.includes(statut)) {
      return NextResponse.json(
        { error: 'Statut invalide', validStatuts },
        { status: 400 }
      );
    }

    const { data: template, error } = await supabase
      .from('proposition_templates')
      .update({ statut })
      .eq('id', id)
      .eq('organization_id', user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, template });
  } catch (error) {
    console.error('Error updating template status:', error);
    return NextResponse.json(
      { error: 'Failed to update template status' },
      { status: 500 }
    );
  }
}
