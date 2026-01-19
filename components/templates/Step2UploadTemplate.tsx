'use client';

import { useState } from 'react';
import { Upload, Loader2, FileSpreadsheet, X } from 'lucide-react';
import { TemplateData, ExcelState } from './TemplateWizard';
import { ExcelMultiSheetMapper } from './ExcelMultiSheetMapper';
import { getArrayFieldsForSecteur, type ArrayFieldDefinition } from '@/components/admin/organizationFormConfig';

interface SheetInfo {
  name: string;
  rows: number;
  cols: number;
  cells: { [key: string]: string };
  preview: { ref: string; value: string }[];
}

interface SheetMapping {
  sheetName: string;
  mapping: { [fieldName: string]: string | string[] };
}

interface Props {
  templateData: Partial<TemplateData>;
  updateTemplateData: (data: Partial<TemplateData>) => void;
  excelState: ExcelState;
  updateExcelState: (data: Partial<ExcelState>) => void;
  secteur: string;
  onNext: () => void;
  onPrev: () => void;
  isLoading?: boolean;
  onSave?: () => void;
}

type Step = 'upload' | 'parse-excel' | 'map-sheets' | 'uploading';

export function Step2UploadTemplate({
  templateData,
  updateTemplateData,
  excelState,
  updateExcelState,
  secteur,
  onNext,
  onPrev,
  isLoading = false,
  onSave,
}: Props) {
  // Utiliser l'état Excel partagé du wizard
  const { file, fileName, sheets: excelSheets, mappings: savedMappings, arrayMappings: savedArrayMappings } = excelState;
  const hasSavedData = excelSheets.length > 0;
  
  // Obtenir les champs de type tableau pour ce secteur, en tenant compte des fusions
  const baseArrayFields = getArrayFieldsForSecteur(secteur, templateData.merge_config);
  const customFields = (templateData.file_config as any)?.custom_fields || [];
  const customArrayCats = (templateData.file_config as any)?.custom_array_fields || [];

  const baseArrayIds = new Set(baseArrayFields.map((a) => a.id));

  const arrayIdsFromCustomFields = new Set(
    customFields
      .filter((d: any) => d && d.fieldType === 'array')
      .map((d: any) => {
        if (typeof d.arrayId === 'string' && d.arrayId.trim()) return d.arrayId.trim();
        if (typeof d.fieldPath === 'string') {
          const m = d.fieldPath.match(/^([^\[]+)\[\]\./);
          if (m?.[1]) return m[1];
        }
        return null;
      })
      .filter(Boolean)
  );

  const customArrayLabelById = new Map(
    (customArrayCats as any[])
      .filter((c) => c && typeof c.id === 'string' && c.id.trim())
      .map((c) => [c.id.trim(), typeof c.label === 'string' && c.label.trim() ? c.label.trim() : c.id.trim()])
  );

  const extraArrayDefs: ArrayFieldDefinition[] = Array.from(
    new Set([
      ...(customArrayCats as any[])
        .filter((c) => c && typeof c.id === 'string' && c.id.trim())
        .map((c) => c.id.trim()),
      ...Array.from(arrayIdsFromCustomFields),
    ])
  )
    .filter((id) => id && !baseArrayIds.has(id))
    .map((id) => ({
      id,
      label: customArrayLabelById.get(id) || id,
      description: '',
      rowFields: [],
    }));

  const arrayFields = [...baseArrayFields, ...extraArrayDefs].map((arr) => {
    const customForArray = customFields
      .filter((d: any) => d && d.fieldType === 'array' && d.arrayId === arr.id && typeof d.key === 'string' && d.key.trim())
      .map((d: any) => d.key.trim());

    if (customForArray.length === 0) return arr;

    const existing = new Set(arr.rowFields.map((rf) => rf.id));
    const extraRowFields = customForArray
      .filter((key: string) => !existing.has(key))
      .map((key: string) => ({ id: key, label: key, type: 'string' as const }));

    if (extraRowFields.length === 0) return arr;

    return {
      ...arr,
      rowFields: [...arr.rowFields, ...extraRowFields],
    };
  });
  
  const [fileType, setFileType] = useState<'excel' | 'word' | 'pdf' | null>(templateData.file_type || null);
  const [parseError, setParseError] = useState<string | null>(null);

  const getInitialStep = (): Step => {
    if (hasSavedData && savedMappings.length > 0) {
      return 'map-sheets';
    }
    if (hasSavedData) {
      return 'upload'; // Afficher le résumé du fichier
    }
    return 'upload';
  };
  const [step, setStep] = useState<Step>(getInitialStep());

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Étape 2 : Upload du template master
          </h2>
          <p className="text-gray-600">
            Chargement du fichier template...
          </p>
        </div>
        <div className="flex items-center justify-center py-12 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
          <div className="text-center">
            <Loader2 className="mx-auto h-12 w-12 text-blue-600 animate-spin mb-4" />
            <p className="text-gray-600 font-medium">Récupération du fichier et analyse...</p>
            <p className="text-sm text-gray-500 mt-1">Veuillez patienter</p>
          </div>
        </div>
      </div>
    );
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const extension = selectedFile.name.split('.').pop()?.toLowerCase();
    let type: 'excel' | 'word' | 'pdf' | null = null;

    if (extension === 'xlsx' || extension === 'xls') {
      type = 'excel';
    } else if (extension === 'docx' || extension === 'doc') {
      type = 'word';
    } else if (extension === 'pdf') {
      type = 'pdf';
    } else {
      alert('Format de fichier non supporté. Utilisez Excel, Word ou PDF.');
      return;
    }

    updateExcelState({
      file: selectedFile,
      fileName: selectedFile.name,
      sheets: [],
      mappings: [],
    });
    setFileType(type);

    // Pour Excel, parser le fichier pour obtenir les feuilles
    if (type === 'excel') {
      setStep('parse-excel');
      setParseError(null);
      
      try {
        const formData = new FormData();
        formData.append('file', selectedFile);

        const response = await fetch('/api/templates/parse-excel', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error('Erreur lors du parsing du fichier Excel');
        }

        const result = await response.json();
        // Sauvegarder les feuilles dans l'état partagé
        updateExcelState({
          sheets: result.sheets,
        });
        setStep('map-sheets');
      } catch (error) {
        console.error('Erreur parsing Excel:', error);
        setParseError('Erreur lors de la lecture du fichier Excel');
        setStep('upload');
      }
    } else {
      // Pour Word et PDF, aller directement à l'upload
      handleUploadFile(selectedFile, type);
    }
  };

  const handleUploadFile = async (uploadFile: File, uploadType: 'excel' | 'word' | 'pdf', fileConfig?: any, isSave?: boolean) => {
    setStep('uploading');

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('file_type', uploadType);

      const response = await fetch('/api/templates/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Erreur upload');

      const result = await response.json();

      updateTemplateData({
        file_type: uploadType,
        file_url: result.url,
        file_name: uploadFile.name,
        file_size_mb: uploadFile.size / (1024 * 1024),
        file_config: fileConfig || {},
      });

      if (isSave && onSave) {
        onSave();
      } else {
        onNext();
      }
    } catch (error) {
      console.error('Erreur upload:', error);
      alert('Erreur lors de l\'upload du fichier');
      setStep('upload');
    }
  };

  const handleMultiSheetMappingComplete = async (sheetMappings: SheetMapping[], fileConfig: any, isSave?: boolean) => {
    // Sauvegarder les mappings dans l'état partagé (toujours)
    updateExcelState({ mappings: sheetMappings });

    // Sauvegarder la configuration du mapping multi-feuilles
    const config = {
      ...fileConfig,
      sheetMappings,
    };

    if (file) {
      // Cas 1 : Nouveau fichier à uploader
      await handleUploadFile(file, 'excel', config, isSave);
    } else {
      // Cas 2 : Modification du mapping sur fichier existant (pas de ré-upload)
      // On met juste à jour la config dans le state global
      updateTemplateData({
        file_config: config,
      });

      if (isSave && onSave) {
        onSave();
      } else {
        onNext();
      }
    }
  };

  // Retour depuis le mapping vers l'upload (conserve les données)
  const handleBackFromMapping = () => {
    // Les données sont déjà dans excelState, on revient juste à l'upload
    setStep('upload');
  };

  // Changer de fichier (réinitialise tout)
  const handleChangeFile = () => {
    updateExcelState({
      file: null,
      fileName: null,
      sheets: [],
      mappings: [],
      arrayMappings: [],
    });
    setFileType(null);
    setStep('upload');
    // Nettoyer le templateData
    updateTemplateData({
      file_type: undefined,
      file_config: {},
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Étape 2 : Upload du template master
        </h2>
        <p className="text-gray-600">
          Uploadez votre fichier template (Excel, Word ou PDF)
        </p>
      </div>

      {/* Étape 1 : Upload */}
      {step === 'upload' && (
        <>
          {/* ... (erreurs et contenu) ... */}
          
          {parseError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-800">{parseError}</p>
            </div>
          )}

          {/* Fichier déjà sélectionné avec mappings */}
          {(file || fileName) && excelSheets.length > 0 ? (
            <div className="space-y-4">
              {/* Fichier actuel */}
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="w-8 h-8 text-green-600" />
                    <div>
                      <p className="font-medium text-gray-900">{fileName}</p>
                      <p className="text-sm text-gray-500">
                        {excelSheets.length} feuille{excelSheets.length > 1 ? 's' : ''} détectée{excelSheets.length > 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleChangeFile}
                    className="text-sm text-gray-500 hover:text-red-600 flex items-center gap-1"
                  >
                    <X className="w-4 h-4" />
                    Changer
                  </button>
                </div>
              </div>

              {/* Résumé des mappings sauvegardés */}
              {savedMappings.length > 0 && (
                <div className="border border-green-200 rounded-lg p-4 bg-green-50">
                  <h4 className="font-semibold text-green-900 mb-2">
                    ✓ Mappings configurés ({savedMappings.length} feuille{savedMappings.length > 1 ? 's' : ''})
                  </h4>
                  <div className="space-y-2">
                    {savedMappings.map((sm, idx) => (
                      <div key={idx} className="text-sm text-green-800">
                        <strong>{sm.sheetName}</strong> : {Object.keys(sm.mapping).length} champs
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bouton pour continuer le mapping */}
              <button
                onClick={() => setStep('map-sheets')}
                className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {savedMappings.length > 0 ? 'Modifier le mapping' : 'Configurer le mapping'}
              </button>
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-12">
              <div className="text-center">
                <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <div className="mb-4">
                  <label
                    htmlFor="file-upload"
                    className="cursor-pointer inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Upload className="w-5 h-5" />
                    Choisir un fichier
                  </label>
                  <input
                    id="file-upload"
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xls,.docx,.doc,.pdf"
                    onChange={handleFileChange}
                  />
                </div>
                <p className="text-sm text-gray-500">
                  Formats acceptés : Excel (.xlsx, .xls), Word (.docx, .doc), PDF (.pdf)
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  Taille maximale : 50 MB
                </p>
              </div>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">
              📌 Informations importantes
            </h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Ce fichier sera votre <strong>template master</strong></li>
              <li>• Il ne sera <strong>jamais modifié</strong> directement</li>
              <li>• Chaque proposition créera une <strong>copie</strong> de ce fichier</li>
              <li>
                • Pour Excel : Mappez les cellules sur <strong>une ou plusieurs feuilles</strong>
              </li>
              <li>
                • Pour Word : Utilisez des variables {'{{'} nom_variable {'}}'}
              </li>
              <li>• Pour PDF : Utilisez des formulaires remplissables</li>
            </ul>
          </div>

          <div className="flex justify-between pt-6 border-t border-gray-200">
            <button
              onClick={onPrev}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Précédent
            </button>
            {onSave && hasSavedData && (
              <button
                onClick={onSave}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Sauvegarder
              </button>
            )}
          </div>
        </>
      )}

      {/* Étape 2 : Parsing Excel en cours */}
      {step === 'parse-excel' && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="mx-auto h-12 w-12 text-blue-600 animate-spin mb-4" />
            <p className="text-gray-600">Analyse du fichier Excel...</p>
            <p className="text-sm text-gray-500 mt-2">Extraction des feuilles et cellules</p>
          </div>
        </div>
      )}

      {/* Étape 3 : Mapping multi-feuilles */}
      {step === 'map-sheets' && (
        <>
          {excelSheets.length > 0 && templateData.champs_actifs && templateData.champs_actifs.length > 0 ? (
            <ExcelMultiSheetMapper
              sheets={excelSheets}
              fields={templateData.champs_actifs}
              secteur={secteur}
              arrayFields={arrayFields}
              initialMappings={savedMappings}
              initialArrayMappings={savedArrayMappings}
              onComplete={handleMultiSheetMappingComplete}
              onBack={handleBackFromMapping}
              onArrayMappingsChange={(arrayMappings) => updateExcelState({ arrayMappings })}
              onSave={onSave}
            />
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-600 mb-4">Les données du fichier ne sont plus disponibles.</p>
              <button
                onClick={() => {
                  setStep('upload');
                  handleChangeFile();
                }}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Recharger le fichier
              </button>
            </div>
          )}
        </>
      )}

      {/* Étape 4 : Upload en cours */}
      {step === 'uploading' && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="mx-auto h-12 w-12 text-blue-600 animate-spin mb-4" />
            <p className="text-gray-600">Upload du fichier en cours...</p>
          </div>
        </div>
      )}
    </div>
  );
}
