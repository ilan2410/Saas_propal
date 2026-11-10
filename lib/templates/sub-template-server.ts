import { createServiceClient } from '@/lib/supabase/server';
import { organizationStoragePath } from '@/lib/security/storage-access';
export async function removeSubTemplateFiles(urls: (string | null | undefined)[], organizationId: string) {
 const paths = [...new Set(urls.filter((url): url is string => !!url).map(url => organizationStoragePath(url, 'templates', organizationId)).filter((p): p is string => !!p))];
 if (!paths.length) return;
 const { error } = await createServiceClient().storage.from('templates').remove(paths);
 if (error) console.error('Sous-templates : nettoyage stockage', error);
}
export async function subTemplateFiles(templateId: string, organizationId: string) {
 const service = createServiceClient();
 const { data: children, error } = await service.from('template_sub_templates').select('id,file_url').eq('template_id', templateId).eq('organization_id', organizationId);
 if (error) throw error;
 const ids = (children ?? []).map(c => c.id);
 const { data: results, error: resultsError } = ids.length ? await service.from('proposition_sub_template_results').select('file_url').in('sub_template_id', ids).eq('organization_id', organizationId) : {data: [], error: null};
 if (resultsError) throw resultsError;
 return [...(children ?? []), ...(results ?? [])].map(c => c.file_url as string | null);
}

export async function duplicateSubTemplates(sourceId: string, targetId: string, organizationId: string) {
 const service = createServiceClient();
 const { data: children, error } = await service.from('template_sub_templates').select('*').eq('template_id', sourceId).eq('organization_id', organizationId);
 if (error) throw error;
 const copied: string[] = [];
 try {
  for (const child of children ?? []) {
   const key = organizationStoragePath(child.file_url, 'templates', organizationId);
   if (!key) throw new Error('Fichier annexe invalide');
   const destination = organizationId + '/sub-templates/' + crypto.randomUUID() + (child.file_type === 'word' ? '.docx' : '.xlsx');
   const { error: copyError } = await service.storage.from('templates').copy(key, destination);
   if (copyError) throw copyError;
   const url = service.storage.from('templates').getPublicUrl(destination).data.publicUrl;
   copied.push(url);
   const { error: insertError } = await service.from('template_sub_templates').insert({ template_id: targetId, organization_id: organizationId, nom: child.nom, file_type: child.file_type, file_url: url, file_name: child.file_name, file_size_mb: child.file_size_mb, file_config: child.file_config });
   if (insertError) throw insertError;
  }
 } catch(error) {
  await service.from('template_sub_templates').delete().eq('template_id', targetId).eq('organization_id', organizationId);
  await removeSubTemplateFiles(copied, organizationId);
  throw error;
 }
}
