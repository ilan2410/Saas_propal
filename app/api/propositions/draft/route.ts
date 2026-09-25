import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { syncSourceDocumentsAsAttachments } from '@/lib/propositions/source-documents';
import { resolveOrgContext } from '@/lib/auth/org-context';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const serviceSupabase = createServiceClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ctx = await resolveOrgContext(supabase, user);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    const template_id = typeof body?.template_id === 'string' ? body.template_id : null;
    const nom_client = typeof body?.nom_client === 'string' ? body.nom_client : null;
    const source_documents = Array.isArray(body?.source_documents) ? body.source_documents : [];
    const current_step = typeof body?.current_step === 'number' ? body.current_step : 1;

    if (!template_id) {
      return NextResponse.json(
        { error: 'template_id requis' },
        { status: 400 }
      );
    }

    const { data: proposition, error } = await supabase
      .from('propositions')
      .insert({
        organization_id: ctx.organizationId,
        created_by: user.id,
        template_id,
        nom_client,
        source_documents,
        statut: 'draft',
        current_step,
      })
      .select('*')
      .single();

    if (error || !proposition) {
      return NextResponse.json(
        {
          error: 'Failed to create draft proposition',
          details: error?.message || 'Unknown error',
        },
        { status: 500 }
      );
    }

    if (source_documents.length > 0) {
      try {
        await syncSourceDocumentsAsAttachments(serviceSupabase, {
          organizationId: ctx.organizationId,
          propositionId: proposition.id,
          urls: source_documents,
          uploadedBy: user.id,
        });
      } catch (syncError) {
        console.error('Erreur sync pièces jointes (documents source):', syncError);
      }
    }

    return NextResponse.json({ success: true, proposition });
  } catch (error) {
    console.error('Error creating draft proposition:', error);
    return NextResponse.json(
      {
        error: 'Failed to create draft proposition',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
