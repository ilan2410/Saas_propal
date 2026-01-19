'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { TemplateWizard, TemplateData } from './TemplateWizard';

interface Props {
  templateId: string;
  secteur: string;
  defaultFields: string[];
}

export function EditTemplateForm({ templateId, secteur, defaultFields }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState<TemplateData | null>(null);

  useEffect(() => {
    const fetchTemplate = async () => {
      try {
        const response = await fetch(`/api/templates/${templateId}`);
        if (!response.ok) throw new Error('Template non trouvé');
        
        const data = await response.json();
        setTemplate(data.template);
      } catch (error) {
        console.error('Erreur:', error);
        router.push('/templates');
      } finally {
        setLoading(false);
      }
    };

    fetchTemplate();
  }, [templateId, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!template) return null;

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Modifier le template</h1>
      <TemplateWizard 
        defaultFields={defaultFields}
        secteur={secteur}
        initialTemplate={template}
        mode="edit"
      />
    </div>
  );
}
