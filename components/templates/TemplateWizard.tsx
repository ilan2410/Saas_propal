'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { Step1SelectFields } from './Step1SelectFields';
import { Step2UploadTemplate } from './Step2UploadTemplate';
import { Step3Test } from './Step3Test';

const STEPS = [
  { id: 1, name: 'Champs', description: 'Sélectionner les champs' },
  { id: 2, name: 'Template', description: 'Upload et mapping' },
  { id: 3, name: 'Récap', description: 'Récapitulatif' },
];

export interface TemplateData {
  id?: string;
  nom: string;
  description: string;
  prompt_template?: string;
  file_type: 'excel' | 'word' | 'pdf';
  champs_actifs: string[];
  file_config: any;
  file_url: string;
  file_name: string;
  file_size_mb: number;
  merge_config?: string[];
}

interface WizardProps {
  defaultFields: string[];
  secteur: string;
  initialTemplate?: Partial<TemplateData>;
  mode?: 'create' | 'edit';
}

// État Excel partagé entre les étapes
export interface ExcelState {
  file: File | null;
  fileName: string | null;
  sheets: any[];
  mappings: any[];
  arrayMappings: any[];
}

export function TemplateWizard({ defaultFields, secteur, initialTemplate, mode = 'create' }: WizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [templateData, setTemplateData] = useState<Partial<TemplateData>>({
    champs_actifs: initialTemplate?.champs_actifs || [],
    ...initialTemplate,
  });
  
  // État Excel persistant
  const [excelState, setExcelState] = useState<ExcelState>({
    file: null,
    fileName: initialTemplate?.file_name || null,
    sheets: [],
    mappings: initialTemplate?.file_config?.sheetMappings || [],
    arrayMappings: initialTemplate?.file_config?.arrayMappings || [],
  });

  // Charger les feuilles Excel si on édite un template existant avec un fichier Excel
  useEffect(() => {
    if (templateData.file_type === 'excel' && templateData.file_url && excelState.sheets.length === 0) {
      const loadSheets = async () => {
        setIsLoading(true);
        try {
          const response = await fetch('/api/templates/parse-excel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileUrl: templateData.file_url }),
          });

          if (response.ok) {
            const data = await response.json();
            setExcelState(prev => ({ ...prev, sheets: data.sheets || [] }));
          }
        } catch (err) {
          console.error('Erreur chargement feuilles:', err);
        } finally {
          setIsLoading(false);
        }
      };
      loadSheets();
    }
  }, [templateData.file_type, templateData.file_url]);

  const updateTemplateData = (data: Partial<TemplateData>) => {
    setTemplateData((prev) => ({ ...prev, ...data }));
  };
  
  const updateExcelState = (data: Partial<ExcelState>) => {
    setExcelState((prev) => ({ ...prev, ...data }));
  };

  const nextStep = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    try {
      // S'assurer qu'on a un nom
      const dataToSend = {
        ...templateData,
        nom: templateData.nom || `Template ${new Date().toLocaleDateString('fr-FR')}`,
      };
      
      console.log(`${mode === 'create' ? 'Création' : 'Mise à jour'} template avec:`, dataToSend);
      
      const url = mode === 'create' ? '/api/templates/create' : `/api/templates/${initialTemplate?.id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSend),
      });

      const result = await response.json();
      
      if (!response.ok) {
        console.error('Erreur API:', result);
        throw new Error(result.details || result.error || `Erreur ${mode === 'create' ? 'création' : 'mise à jour'} template`);
      }

      router.push(`/templates/${result.template?.id || initialTemplate?.id}`);
    } catch (error) {
      console.error('Erreur:', error);
      alert(`Erreur lors de la ${mode === 'create' ? 'création' : 'mise à jour'} du template: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  };

  return (
    <div className="space-y-8">
      {/* Steps Progress */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <nav aria-label="Progress">
          <ol className="flex items-center justify-between">
            {STEPS.map((step, stepIdx) => (
              <li
                key={step.id}
                className={`relative ${
                  stepIdx !== STEPS.length - 1 ? 'flex-1' : ''
                }`}
              >
                <div className="flex items-center">
                  {/* Step Circle */}
                  <div
                    className={`relative flex h-10 w-10 items-center justify-center rounded-full ${
                      currentStep > step.id
                        ? 'bg-blue-600'
                        : currentStep === step.id
                        ? 'border-2 border-blue-600 bg-white'
                        : 'border-2 border-gray-300 bg-white'
                    }`}
                  >
                    {currentStep > step.id ? (
                      <Check className="h-5 w-5 text-white" />
                    ) : (
                      <span
                        className={`text-sm font-semibold ${
                          currentStep === step.id
                            ? 'text-blue-600'
                            : 'text-gray-500'
                        }`}
                      >
                        {step.id}
                      </span>
                    )}
                  </div>

                  {/* Step Label */}
                  <div className="ml-4">
                    <p
                      className={`text-sm font-medium ${
                        currentStep >= step.id
                          ? 'text-gray-900'
                          : 'text-gray-500'
                      }`}
                    >
                      {step.name}
                    </p>
                    <p className="text-xs text-gray-500">{step.description}</p>
                  </div>

                  {/* Connector Line */}
                  {stepIdx !== STEPS.length - 1 && (
                    <div
                      className={`absolute left-10 top-5 h-0.5 w-full ${
                        currentStep > step.id ? 'bg-blue-600' : 'bg-gray-300'
                      }`}
                      style={{ marginLeft: '2.5rem' }}
                    />
                  )}
                </div>
              </li>
            ))}
          </ol>
        </nav>
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        {currentStep === 1 && (
          <Step1SelectFields
            templateData={templateData}
            updateTemplateData={updateTemplateData}
            onNext={nextStep}
            onSave={mode === 'edit' ? handleComplete : undefined}
            defaultFields={defaultFields}
            secteur={secteur}
          />
        )}
        {currentStep === 2 && (
          <Step2UploadTemplate
            templateData={templateData}
            updateTemplateData={updateTemplateData}
            excelState={excelState}
            updateExcelState={updateExcelState}
            secteur={secteur}
            onNext={nextStep}
            onPrev={prevStep}
            isLoading={isLoading}
            onSave={mode === 'edit' ? handleComplete : undefined}
          />
        )}
        {currentStep === 3 && (
          <Step3Test
            templateData={templateData}
            onComplete={handleComplete}
            onPrev={prevStep}
          />
        )}
      </div>
    </div>
  );
}
