import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { ensureChampsActifsPlaceholder } from '@/lib/utils/prompt';
import { CLIENT_CONFIG_PERMISSION_KEYS, resolveClientConfigPermissions } from '@/lib/security/client-data';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authClient = await createClient();

    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user || user.app_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await params;

    // Utiliser le client admin avec service_role_key
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

    const body = await request.json();
    const {
      nom,
      secteur,
      credits,
      tarif_par_proposition,
      tarif_clone_site,
      claude_model,
      prompt_template,
      champs_defaut,
      client_config_enabled,
      client_config_permissions,
    } = body;

    const hasConfigUpdate =
      typeof client_config_enabled === 'boolean' ||
      (client_config_permissions !== null && typeof client_config_permissions === 'object' && !Array.isArray(client_config_permissions));

    // Validation
    if ((!nom || !secteur) && !hasConfigUpdate) {
      return NextResponse.json(
        { error: 'Nom et secteur sont requis' },
        { status: 400 }
      );
    }

    let nextPreferences: Record<string, unknown> | undefined;
    if (hasConfigUpdate) {
      const { data: currentOrg } = await supabaseAdmin
        .from('organizations')
        .select('preferences')
        .eq('id', id)
        .single();
      const currentPrefs =
        currentOrg?.preferences && typeof currentOrg.preferences === 'object' && !Array.isArray(currentOrg.preferences)
          ? (currentOrg.preferences as Record<string, unknown>)
          : {};
      const currentPerms = resolveClientConfigPermissions(currentPrefs);
      const nextPerms = { ...currentPerms };
      if (typeof client_config_enabled === 'boolean' && !client_config_permissions) {
        for (const key of CLIENT_CONFIG_PERMISSION_KEYS) {
          nextPerms[key] = client_config_enabled;
        }
      }
      if (client_config_permissions && typeof client_config_permissions === 'object' && !Array.isArray(client_config_permissions)) {
        const rawInput = client_config_permissions as Record<string, unknown>;
        for (const key of CLIENT_CONFIG_PERMISSION_KEYS) {
          if (typeof rawInput[key] === 'boolean') {
            nextPerms[key] = rawInput[key] as boolean;
          }
        }
      }
      const anyEnabled = CLIENT_CONFIG_PERMISSION_KEYS.some((key) => nextPerms[key]);
      nextPreferences = {
        ...currentPrefs,
        client_config_enabled: anyEnabled,
        client_config_permissions: nextPerms,
      };
    }

    // Mettre à jour l'organization
    const updates = {
      ...(nom !== undefined ? { nom } : {}),
      ...(secteur !== undefined ? { secteur } : {}),
      ...(credits !== undefined ? { credits } : {}),
      ...(tarif_par_proposition !== undefined ? { tarif_par_proposition } : {}),
      ...(tarif_clone_site !== undefined ? { tarif_clone_site } : {}),
      ...(claude_model !== undefined ? { claude_model } : {}),
      ...(prompt_template !== undefined ? { prompt_template: ensureChampsActifsPlaceholder(String(prompt_template)) } : {}),
      ...(champs_defaut !== undefined ? { champs_defaut } : {}),
      ...(nextPreferences !== undefined ? { preferences: nextPreferences } : {}),
      updated_at: new Date().toISOString(),
    };
    const { data: organization, error: updateError } = await supabaseAdmin
      .from('organizations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Erreur mise à jour organization:', updateError);
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      organization,
    });
  } catch (error) {
    console.error('Erreur mise à jour client:', error);
    return NextResponse.json(
      {
        error: 'Erreur lors de la mise à jour du client',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
