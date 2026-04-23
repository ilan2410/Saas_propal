'use client';

import { useState, useRef, useEffect } from 'react';
import { Upload, Loader2, FileSpreadsheet, FileText, X, Check, Play, HelpCircle, ChevronRight, ChevronLeft } from 'lucide-react';
import { TemplateData, ExcelState } from './TemplateWizard';
import { ExcelMultiSheetMapper } from './ExcelMultiSheetMapper';
import { getArrayFieldsForSecteur, type ArrayFieldDefinition } from '@/components/admin/organizationFormConfig';

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

interface ValidationError {
  type: 'warning' | 'error';
  message: string;
  details?: string;
}

interface TableValidation {
  arrayId: string;
  arrayLabel: string;
  found: boolean;
  hasStartTag: boolean;
  hasEndTag: boolean;
  foundFields: string[];
  missingFields: string[];
  extraFields: string[];
  columnCount?: number;
  expectedColumnCount?: number;
  errors: ValidationError[];
}

type Step = 'upload' | 'parse-excel' | 'map-sheets' | 'parse-word' | 'preview-word' | 'uploading';

type CustomFieldConfig = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === 'string' ? v : undefined;
}

function getArrayOfRecords(obj: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const v = obj[key];
  if (!Array.isArray(v)) return [];
  return v.filter(isRecord);
}

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
  const fileConfig = (templateData.file_config || {}) as CustomFieldConfig;
  const customFields = getArrayOfRecords(fileConfig, 'custom_fields');
  const customArrayCats = getArrayOfRecords(fileConfig, 'custom_array_fields');

  const baseArrayIds = new Set(baseArrayFields.map((a) => a.id));

  const arrayIdsFromCustomFields = new Set(
    customFields
      .filter((d) => getString(d, 'fieldType') === 'array')
      .map((d) => {
        const arrayId = getString(d, 'arrayId');
        if (arrayId && arrayId.trim()) return arrayId.trim();
        const fieldPath = getString(d, 'fieldPath');
        if (fieldPath) {
          const m = fieldPath.match(/^([^\[]+)\[\]\./);
          if (m?.[1]) return m[1];
        }
        return null;
      })
      .filter(Boolean)
  );

  const customArrayLabelById = new Map(
    customArrayCats
      .map((c) => {
        const id = getString(c, 'id')?.trim();
        if (!id) return null;
        const label = getString(c, 'label')?.trim();
        return [id, label && label.length > 0 ? label : id] as const;
      })
      .filter(Boolean) as Array<readonly [string, string]>
  );

  const extraArrayDefs: ArrayFieldDefinition[] = Array.from(
    new Set([
      ...customArrayCats
        .map((c) => getString(c, 'id')?.trim() || null)
        .filter(Boolean),
      ...Array.from(arrayIdsFromCustomFields),
    ])
  )
    .filter((id): id is string => !!id && !baseArrayIds.has(id))
    .map((id) => ({
      id,
      label: customArrayLabelById.get(id) || id,
      description: '',
      rowFields: [],
    }));

  const arrayFields = [...baseArrayFields, ...extraArrayDefs].map((arr) => {
    const customForArray = customFields
      .filter((d) => getString(d, 'fieldType') === 'array')
      .filter((d) => getString(d, 'arrayId') === arr.id)
      .map((d) => getString(d, 'key')?.trim() || null)
      .filter(Boolean) as string[];

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
  
  const [parseError, setParseError] = useState<string | null>(null);
  const [wordPreviewHtml, setWordPreviewHtml] = useState<string | null>(null);
  const [wordParseError, setWordParseError] = useState<string | null>(null);
  const [wordParseMessages, setWordParseMessages] = useState<string[]>([]);
  const [isRenderingDocx, setIsRenderingDocx] = useState(false);
  const [docxRenderError, setDocxRenderError] = useState<string | null>(null);
  const docxPreviewRef = useRef<HTMLDivElement>(null);
  const [copiedKeys, setCopiedKeys] = useState<Record<string, true>>({});
  const [showHelp, setShowHelp] = useState(false);
  const [currentHelpStep, setCurrentHelpStep] = useState(0);
  const [validationResults, setValidationResults] = useState<{
    simpleFields: { found: string[]; missing: string[] };
    tables: TableValidation[];
    errors: ValidationError[];
  } | null>(null);
  const [hasUploadedBefore, setHasUploadedBefore] = useState(false);
  const [collapsedAdvanced, setCollapsedAdvanced] = useState<Record<string, boolean>>({});
  
  const champsActifs = Array.isArray(templateData.champs_actifs) ? templateData.champs_actifs : [];
  const champsSimples = champsActifs.filter((f): f is string => typeof f === 'string' && !f.includes('[]'));
  const exempleTableau = arrayFields.find((a) => a.id === 'lignes') || arrayFields[0];
  const exempleTableauFieldIds = (exempleTableau?.rowFields || []).slice(0, 3).map((rf) => rf.id);
  const hasCriticalValidationErrors =
    validationResults !== null &&
    (validationResults.errors.some((e) => e.type === 'error') ||
      validationResults.tables.some((t) => t.errors.some((e) => e.type === 'error')));

  const getInitialStep = (): Step => {
    if (hasSavedData && savedMappings.length > 0) {
      return 'map-sheets';
    }
    if (hasSavedData) {
      return 'upload';
    }
    return 'upload';
  };
  const [step, setStep] = useState<Step>(getInitialStep());

  // Render docx-preview when a Word file is ready
  useEffect(() => {
    if (step !== 'preview-word' || !file) return;

    let cancelled = false;
    setIsRenderingDocx(true);
    setDocxRenderError(null);

    (async () => {
      try {
        const { renderAsync } = await import('docx-preview');
        const arrayBuffer = await file.arrayBuffer();
        if (cancelled || !docxPreviewRef.current) return;
        docxPreviewRef.current.innerHTML = '';
        await renderAsync(arrayBuffer, docxPreviewRef.current, undefined, {
          className: 'docx',
          inWrapper: false,
          ignoreWidth: false,
        });
      } catch {
        if (!cancelled) setDocxRenderError("Impossible de générer l'aperçu pour ce document.");
      } finally {
        if (!cancelled) setIsRenderingDocx(false);
      }
    })();

    return () => { cancelled = true; };
  }, [file, step]);

  // Aide contextuelle - étapes
  const helpSteps = [
    {
      title: "Bienvenue ! 👋",
      content: "Je vais vous montrer comment préparer votre document Word en 2 minutes. C'est très simple, vous allez voir !",
      icon: "👋"
    },
    {
      title: "Les variables, c'est quoi ? 🤔",
      content: "Imaginez votre document Word comme un formulaire papier avec des cases vides. Au lieu d'écrire manuellement chaque information, vous allez mettre des 'codes' qui seront remplis automatiquement.",
      icon: "💡"
    },
    {
      title: "Exemple concret 📱",
      content: "Au lieu d'écrire 'Client : Société ABC', vous mettez 'Client : {{nom_client}}'. Quand vous créez une proposition, PropoBoost remplace {{nom_client}} par le vrai nom !",
      icon: "✨"
    },
    {
      title: "Comment faire ? 📋",
      content: "C'est simple : 1) Cliquez sur 'Copier' à côté d'un champ, 2) Dans Word, cliquez où vous voulez la donnée, 3) Faites Ctrl+V. C'est tout !",
      icon: "🎯"
    }
  ];

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
    } else if (extension === 'docx') {
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

    // Notify onboarding tour of the selected file type
    if (type === 'excel' || type === 'word') {
      window.dispatchEvent(
        new CustomEvent('template:file-type-selected', { detail: { fileType: type } })
      );
    }

    // Pour Excel, parser le fichier pour obtenir les feuilles
    if (type === 'excel') {
      setStep('parse-excel');
      setParseError(null);
      setWordPreviewHtml(null);
      setWordParseError(null);
      setWordParseMessages([]);

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

        const result = (await response.json().catch(() => null)) as unknown;
        const sheets = isRecord(result) && Array.isArray(result.sheets) ? (result.sheets as ExcelState['sheets']) : [];
        updateExcelState({
          sheets,
        });
        setStep('map-sheets');
      } catch (error) {
        console.error('Erreur parsing Excel:', error);
        setParseError('Erreur lors de la lecture du fichier Excel');
        setStep('upload');
      }
    } else {
      if (type === 'word') {
        await parseWordToPreview(selectedFile);
      } else {
        handleUploadFile(selectedFile, type);
      }
    }
  };

  const handleUploadFile = async (
    uploadFile: File,
    uploadType: 'excel' | 'word' | 'pdf',
    fileConfig?: Record<string, unknown>,
    isSave?: boolean
  ) => {
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

      const result = (await response.json().catch(() => null)) as unknown;
      const url = isRecord(result) ? getString(result, 'url') : undefined;
      if (!url) throw new Error('Réponse upload invalide');

      updateTemplateData({
        file_type: uploadType,
        file_url: url,
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

  const handleMultiSheetMappingComplete = async (
    sheetMappings: SheetMapping[],
    fileConfig: Record<string, unknown>,
    isSave?: boolean
  ) => {
    updateExcelState({ mappings: sheetMappings });

    const config = {
      ...fileConfig,
      sheetMappings,
    };

    if (file) {
      await handleUploadFile(file, 'excel', config, isSave);
    } else {
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

  const handleBackFromMapping = () => {
    setStep('upload');
  };

  const copyText = async (text: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch {}

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand('copy');
    } finally {
      document.body.removeChild(textarea);
    }
  };

  const markCopied = (key: string) => {
    setCopiedKeys((prev) => ({ ...prev, [key]: true }));
  };

  const copyAndMark = async (text: string, key: string) => {
    await copyText(text);
    markCopied(key);
  };

  const validateWordVariables = (html: string, parsedVariables?: string[]) => {
    const errors: ValidationError[] = [];
    const foundSimpleFields: string[] = [];
    const missingSimpleFields: string[] = [];

    champsSimples.forEach((field) => {
      const pattern = `{{${field}}}`;
      // Prefer the API-parsed variables (raw text, handles split runs in Word XML)
      // Fall back to HTML search for backward compatibility
      const found = parsedVariables ? parsedVariables.includes(field) : html.includes(pattern);
      if (found) {
        foundSimpleFields.push(field);
      } else {
        missingSimpleFields.push(field);
      }
    });

    const tableValidations: TableValidation[] = arrayFields.map((arr) => {
      const startTag = `{{#${arr.id}}}`;
      const endTag = `{{/${arr.id}}}`;
      const hasStartTag = html.includes(startTag);
      const hasEndTag = html.includes(endTag);

      const validation: TableValidation = {
        arrayId: arr.id,
        arrayLabel: arr.label || arr.id,
        found: hasStartTag && hasEndTag,
        hasStartTag,
        hasEndTag,
        foundFields: [],
        missingFields: [],
        extraFields: [],
        errors: [],
      };

      if (!hasStartTag && !hasEndTag) {
        return validation;
      }

      if (hasStartTag && !hasEndTag) {
        validation.errors.push({
          type: 'error',
          message: `Le tableau "${validation.arrayLabel}" a une balise d'ouverture {{#${arr.id}}} mais pas de balise de fermeture {{/${arr.id}}}`,
          details: 'Ajoutez la balise de fermeture à la fin de votre ligne de tableau',
        });
      }

      if (!hasStartTag && hasEndTag) {
        validation.errors.push({
          type: 'error',
          message: `Le tableau "${validation.arrayLabel}" a une balise de fermeture {{/${arr.id}}} mais pas de balise d'ouverture {{#${arr.id}}}`,
          details: "Ajoutez la balise d'ouverture au début de votre ligne de tableau",
        });
      }

      if (!validation.found) {
        return validation;
      }

      const startIndex = html.indexOf(startTag);
      const endIndex = html.indexOf(endTag);

      if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
        validation.errors.push({
          type: 'error',
          message: `Le tableau "${validation.arrayLabel}" a des balises dans le mauvais ordre`,
          details: "La balise d'ouverture doit être avant la balise de fermeture",
        });
        return validation;
      }

      const tableContent = html.substring(startIndex, endIndex + endTag.length);

      arr.rowFields.forEach((rf) => {
        const fieldPattern = `{{${rf.id}}}`;
        if (tableContent.includes(fieldPattern)) {
          validation.foundFields.push(rf.id);
        } else {
          validation.missingFields.push(rf.id);
        }
      });

      const allFieldIds = arr.rowFields.map((rf) => rf.id);
      const variableRegex = /\{\{([^#/}][^}]*)\}\}/g;
      let match: RegExpExecArray | null;
      const foundVariables = new Set<string>();

      while ((match = variableRegex.exec(tableContent)) !== null) {
        const varName = (match[1] || '').trim();
        if (!varName) continue;
        foundVariables.add(varName);
        if (!allFieldIds.includes(varName)) {
          validation.extraFields.push(varName);
        }
      }

      const tdMatches = tableContent.match(/<td[^>]*>/g);
      if (tdMatches) {
        validation.columnCount = tdMatches.length;
        validation.expectedColumnCount = validation.foundFields.length + 2;
      }

      if (validation.missingFields.length > 0) {
        validation.errors.push({
          type: 'warning',
          message: `Le tableau "${validation.arrayLabel}" ne contient pas tous les champs`,
          details: `Champs manquants : ${validation.missingFields.join(', ')}`,
        });
      }

      if (validation.extraFields.length > 0) {
        validation.errors.push({
          type: 'warning',
          message: `Le tableau "${validation.arrayLabel}" contient des variables non configurées`,
          details: `Variables inconnues : ${validation.extraFields.join(', ')}. Ces variables ne seront pas remplies automatiquement.`,
        });
      }

      arr.rowFields.forEach((rf) => {
        const fieldPattern = `{{${rf.id}}}`;
        const fieldIndex = html.indexOf(fieldPattern);
        if (fieldIndex !== -1 && (fieldIndex < startIndex || fieldIndex > endIndex)) {
          validation.errors.push({
            type: 'error',
            message: `La variable {{${rf.id}}} est en dehors du bloc tableau`,
            details: `Elle doit être placée entre {{#${arr.id}}} et {{/${arr.id}}}`,
          });
        }
      });

      return validation;
    });

    if (foundSimpleFields.length === 0 && tableValidations.every((t) => !t.found)) {
      errors.push({
        type: 'error',
        message: 'Aucune variable détectée dans le document',
        details: "Assurez-vous d'avoir ajouté au moins quelques variables avant de continuer",
      });
    }

    return {
      simpleFields: {
        found: foundSimpleFields,
        missing: missingSimpleFields,
      },
      tables: tableValidations,
      errors,
    };
  };

  async function parseWordToPreview(nextFile: File) {
    setStep('parse-word');
    setWordPreviewHtml(null);
    setWordParseError(null);
    setWordParseMessages([]);
    setDocxRenderError(null);
    setIsRenderingDocx(false);
    if (docxPreviewRef.current) docxPreviewRef.current.innerHTML = '';
    setValidationResults(null);

    try {
      const formData = new FormData();
      formData.append('file', nextFile);

      const response = await fetch('/api/templates/parse-word', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Erreur lors du parsing du fichier Word');
      }

      const result = (await response.json().catch(() => null)) as unknown;
      const html = isRecord(result) ? getString(result, 'html') : undefined;
      const apiVariables = isRecord(result) && Array.isArray(result.variables)
        ? (result.variables as unknown[]).filter((v): v is string => typeof v === 'string')
        : undefined;
      const messages = isRecord(result) && Array.isArray(result.messages)
        ? (result.messages as unknown[]).filter((m): m is string => typeof m === 'string')
        : [];
      setWordPreviewHtml(html || null);
      setWordParseMessages(messages);
      if (hasUploadedBefore) {
        const validation = validateWordVariables(html || '', apiVariables);
        setValidationResults(validation);
      }
      setHasUploadedBefore(true);
      setStep('preview-word');
    } catch (error) {
      console.error('Erreur parsing Word:', error);
      setWordParseError('Erreur lors de la lecture du fichier Word');
      setStep('preview-word');
    }
  }

  const buildWordUploadConfig = () => {
    const wordFieldMappings = champsSimples.reduce<Record<string, string>>((acc, field) => {
      acc[`{{${field}}}`] = field;
      return acc;
    }, {});

    const existingFileConfig = isRecord(templateData.file_config) ? templateData.file_config : {};
    return {
      ...existingFileConfig,
      formatVariables: '{{var}}',
      fieldMappings: wordFieldMappings,
    };
  };

  const buildWordTableRowTsv = (arrayId: string, rowFieldIds: string[]) => {
    const tokens = rowFieldIds.map((id) => `{{${id}}}`);
    return [`{{#${arrayId}}}`, ...tokens, `{{/${arrayId}}}`].join('\t');
  };

  const handleCopyTableRow = async (arrayId: string, rowFieldIds: string[]) => {
    const tsv = buildWordTableRowTsv(arrayId, rowFieldIds);
    await copyAndMark(tsv, `row:${arrayId}`);
  };

  const handleWordFinalFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const finalFile = e.target.files?.[0];
    if (!finalFile) return;

    const extension = finalFile.name.split('.').pop()?.toLowerCase();
    if (extension !== 'docx') {
      alert('Seuls les fichiers .docx sont supportés pour Word.');
      return;
    }

    updateExcelState({
      file: finalFile,
      fileName: finalFile.name,
      sheets: [],
      mappings: [],
    });

    await parseWordToPreview(finalFile);
  };

  const handleSaveWordTemplate = async (isSave?: boolean) => {
    if (!isSave && hasCriticalValidationErrors) {
      alert('Veuillez corriger les erreurs critiques dans votre fichier Word avant de continuer.');
      return;
    }
    if (!file) {
      alert('Veuillez sélectionner un fichier Word (.docx) avant d\'enregistrer.');
      return;
    }
    await handleUploadFile(file, 'word', buildWordUploadConfig(), isSave);
  };

  const handleChangeFile = () => {
    updateExcelState({
      file: null,
      fileName: null,
      sheets: [],
      mappings: [],
      arrayMappings: [],
    });
    setStep('upload');
    setWordPreviewHtml(null);
    setWordParseError(null);
    setWordParseMessages([]);
    setDocxRenderError(null);
    setIsRenderingDocx(false);
    if (docxPreviewRef.current) docxPreviewRef.current.innerHTML = '';
    setCopiedKeys({});
    setValidationResults(null);
    setHasUploadedBefore(false);
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

      {/* Bouton d'aide flottant */}
      {step === 'preview-word' && (
        <button
          onClick={() => setShowHelp(true)}
          className="fixed bottom-6 right-6 bg-blue-600 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg hover:bg-blue-700 transition-all hover:scale-110 z-50"
          title="Besoin d'aide ?"
        >
          <HelpCircle className="w-7 h-7" />
        </button>
      )}

      {/* Modal d'aide contextuelle */}
      {showHelp && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-8 relative shadow-2xl">
            <button
              onClick={() => setShowHelp(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="text-center mb-8">
              <div className="text-6xl mb-4">{helpSteps[currentHelpStep].icon}</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                {helpSteps[currentHelpStep].title}
              </h3>
              <p className="text-gray-700 text-lg leading-relaxed">
                {helpSteps[currentHelpStep].content}
              </p>
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => setCurrentHelpStep(Math.max(0, currentHelpStep - 1))}
                disabled={currentHelpStep === 0}
                className="px-4 py-2 text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <ChevronLeft className="w-5 h-5" />
                Précédent
              </button>

              <div className="flex gap-2">
                {helpSteps.map((_, idx) => (
                  <div
                    key={idx}
                    className={`w-2 h-2 rounded-full ${
                      idx === currentHelpStep ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  />
                ))}
              </div>

              {currentHelpStep < helpSteps.length - 1 ? (
                <button
                  onClick={() => setCurrentHelpStep(currentHelpStep + 1)}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                  Suivant
                  <ChevronRight className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={() => setShowHelp(false)}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  C&apos;est parti ! ✨
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Étape 1 : Upload */}
      {step === 'upload' && (
        <>
          {parseError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-800">{parseError}</p>
            </div>
          )}
          {wordParseError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-800">{wordParseError}</p>
            </div>
          )}

          {/* Fichier déjà sélectionné avec mappings */}
          {(file || fileName) && excelSheets.length > 0 ? (
            <div className="space-y-4">
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

              <button
                onClick={() => setStep('map-sheets')}
                className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {savedMappings.length > 0 ? 'Modifier le mapping' : 'Configurer le mapping'}
              </button>
            </div>
          ) : (
            <div id="upload-zone" className="border-2 border-dashed border-gray-300 rounded-lg p-12">
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
                    accept=".xlsx,.xls,.docx,.pdf"
                    onChange={handleFileChange}
                  />
                </div>
                <p className="text-sm text-gray-500">
                  Formats acceptés : Excel (.xlsx, .xls), Word (.docx), PDF (.pdf)
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
                • Pour Word : Uploadez une première version pour aperçu, puis ajoutez les variables et ré-uploadez la version finale
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

      {/* Étape 2 : Parsing Word en cours */}
      {step === 'parse-word' && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="mx-auto h-12 w-12 text-blue-600 animate-spin mb-4" />
            <p className="text-gray-600">Analyse du fichier Word...</p>
            <p className="text-sm text-gray-500 mt-2">Génération d&apos;un aperçu</p>
          </div>
        </div>
      )}

      {/* Étape 3 : Preview Word + guide AMÉLIORÉ */}
      {step === 'preview-word' && (
        <div className="space-y-6">
          {/* En-tête du fichier */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-8 h-8 text-blue-600" />
                <div>
                  <p className="font-medium text-gray-900">{fileName || 'Template Word'}</p>
                  <p className="text-sm text-gray-500">Document Word (.docx)</p>
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

          {validationResults && (
            <div className="space-y-4">
              {validationResults.errors.length > 0 && (
                <div className="bg-red-50 border-2 border-red-300 rounded-xl p-6">
                  <h3 className="font-bold text-red-900 mb-3 flex items-center gap-2 text-lg">
                    <span className="text-2xl">⚠️</span>
                    Problèmes détectés
                  </h3>
                  <div className="space-y-2">
                    {validationResults.errors.map((error, idx) => (
                      <div key={idx} className="bg-white border border-red-200 rounded-lg p-3">
                        <p className="font-medium text-red-900">{error.message}</p>
                        {error.details && <p className="text-sm text-red-700 mt-1">{error.details}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {validationResults.tables.some((t) => t.found || t.errors.length > 0) && (
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                  <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2 text-lg">
                    <span className="text-2xl">📊</span>
                    Vérification des tableaux
                  </h3>
                  <div className="space-y-4">
                    {validationResults.tables
                      .filter((t) => t.found || t.errors.length > 0)
                      .map((table, idx) => {
                        const hasErrors = table.errors.some((e) => e.type === 'error');
                        const hasWarnings = table.errors.some((e) => e.type === 'warning');
                        const isValid = table.found && !hasErrors && table.missingFields.length === 0;

                        return (
                          <div
                            key={idx}
                            className={`border-2 rounded-lg p-4 ${
                              hasErrors
                                ? 'border-red-300 bg-red-50'
                                : hasWarnings
                                  ? 'border-yellow-300 bg-yellow-50'
                                  : isValid
                                    ? 'border-green-300 bg-green-50'
                                    : 'border-gray-300 bg-gray-50'
                            }`}
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <h4 className="font-bold text-gray-900 flex items-center gap-2">
                                  {isValid ? '✅' : hasErrors ? '❌' : hasWarnings ? '⚠️' : '⏸️'}
                                  {table.arrayLabel}
                                </h4>
                                <p className="text-xs text-gray-500 font-mono">{table.arrayId}</p>
                              </div>
                              {isValid && (
                                <span className="text-sm text-green-700 font-medium bg-green-100 px-3 py-1 rounded-full">
                                  Valide
                                </span>
                              )}
                            </div>

                            {table.found && (
                              <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
                                <div className="flex items-center gap-2">
                                  <span className={table.hasStartTag ? 'text-green-600' : 'text-red-600'}>
                                    {table.hasStartTag ? '✓' : '✗'}
                                  </span>
                                  <span className="text-gray-700">Balise d&apos;ouverture</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={table.hasEndTag ? 'text-green-600' : 'text-red-600'}>
                                    {table.hasEndTag ? '✓' : '✗'}
                                  </span>
                                  <span className="text-gray-700">Balise de fermeture</span>
                                </div>
                              </div>
                            )}

                            {table.foundFields.length > 0 && (
                              <div className="mb-2">
                                <p className="text-sm font-semibold text-gray-700 mb-1">
                                  Champs détectés ({table.foundFields.length}) :
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {table.foundFields.map((field) => (
                                    <span
                                      key={field}
                                      className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded font-mono"
                                    >
                                      {field}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {table.missingFields.length > 0 && (
                              <div className="mb-2">
                                <p className="text-sm font-semibold text-yellow-700 mb-1">
                                  Champs manquants ({table.missingFields.length}) :
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {table.missingFields.map((field) => (
                                    <span
                                      key={field}
                                      className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded font-mono"
                                    >
                                      {field}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {table.extraFields.length > 0 && (
                              <div className="mb-2">
                                <p className="text-sm font-semibold text-orange-700 mb-1">
                                  Variables non configurées ({table.extraFields.length}) :
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {table.extraFields.map((field) => (
                                    <span
                                      key={field}
                                      className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded font-mono"
                                    >
                                      {field}
                                    </span>
                                  ))}
                                </div>
                                <p className="text-xs text-orange-600 mt-1">
                                  Ces variables ne seront pas remplies automatiquement
                                </p>
                              </div>
                            )}

                            {table.errors.length > 0 && (
                              <div className="space-y-2 mt-3">
                                {table.errors.map((error, errIdx) => (
                                  <div
                                    key={errIdx}
                                    className={`text-sm p-2 rounded ${
                                      error.type === 'error'
                                        ? 'bg-red-100 text-red-800'
                                        : 'bg-yellow-100 text-yellow-800'
                                    }`}
                                  >
                                    <p className="font-medium">{error.message}</p>
                                    {error.details && <p className="text-xs mt-1">{error.details}</p>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2 text-lg">
                  <span className="text-2xl">📝</span>
                  Champs simples détectés
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-semibold text-green-700 mb-2">
                      Trouvés ({validationResults.simpleFields.found.length})
                    </p>
                    {validationResults.simpleFields.found.length > 0 ? (
                      <div className="space-y-1">
                        {validationResults.simpleFields.found.slice(0, 5).map((field) => (
                          <div key={field} className="text-xs text-gray-600 flex items-center gap-1">
                            <span className="text-green-600">✓</span>
                            <span className="font-mono">&#123;&#123;{field}&#125;&#125;</span>
                          </div>
                        ))}
                        {validationResults.simpleFields.found.length > 5 && (
                          <p className="text-xs text-gray-500 italic">
                            ... et {validationResults.simpleFields.found.length - 5} autre(s)
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 italic">Aucun champ simple trouvé</p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-600 mb-2">
                      Non utilisés ({validationResults.simpleFields.missing.length})
                    </p>
                    {validationResults.simpleFields.missing.length > 0 ? (
                      <div className="space-y-1">
                        {validationResults.simpleFields.missing.slice(0, 5).map((field) => (
                          <div key={field} className="text-xs text-gray-500 flex items-center gap-1">
                            <span className="text-gray-400">○</span>
                            <span className="font-mono">&#123;&#123;{field}&#125;&#125;</span>
                          </div>
                        ))}
                        {validationResults.simpleFields.missing.length > 5 && (
                          <p className="text-xs text-gray-400 italic">
                            ... et {validationResults.simpleFields.missing.length - 5} autre(s)
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-green-600 italic">Tous les champs sont utilisés !</p>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setValidationResults(null)}
                className="w-full py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Masquer la validation
              </button>
            </div>
          )}

          {/* NOUVELLE SECTION : Explication métaphorique */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="bg-blue-600 text-white rounded-full w-12 h-12 flex items-center justify-center text-2xl font-bold flex-shrink-0">
                💡
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">
                  Comment ça marche ?
                </h3>
                <p className="text-gray-700 text-base leading-relaxed mb-3">
                  Imaginez votre document Word comme un formulaire papier avec des cases vides. 
                  Au lieu d&apos;écrire &quot;Client : <span className="border-b-2 border-dashed border-gray-400 px-8"></span>&quot;, vous allez mettre &quot;Client : <span className="bg-yellow-200 px-2 py-0.5 rounded font-mono text-sm">&#123;&#123;nom_client&#125;&#125;</span>&quot;.
                </p>
                <p className="text-gray-700 text-base leading-relaxed">
                  Quand vous créerez une proposition, le système remplacera automatiquement 
                  <span className="bg-yellow-200 px-2 py-0.5 rounded font-mono text-sm mx-1">&#123;&#123;nom_client&#125;&#125;</span> par le vrai nom du client !
                </p>
              </div>
            </div>
          </div>

          {/* NOUVELLE SECTION : Instructions en 3 étapes visuelles */}
          <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-6 text-center">
              3 étapes simples
            </h3>
            
            <div className="space-y-6">
              {/* Étape 1 */}
              <div className="flex gap-4">
                <div className="bg-blue-600 text-white rounded-full w-10 h-10 flex items-center justify-center text-lg font-bold flex-shrink-0">
                  1
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-gray-900 mb-2">Cliquez sur &quot;Copier&quot; à côté d&apos;un champ</h4>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm bg-white px-3 py-2 rounded border border-gray-300">&#123;&#123;nom_client&#125;&#125;</span>
                      <button className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium flex items-center gap-2 hover:bg-blue-700">
                        📋 Copier
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-green-700 mt-2 font-medium flex items-center gap-1">
                    <Check className="w-4 h-4" />
                    Le code est maintenant copié dans votre presse-papier
                  </p>
                </div>
              </div>

              {/* Étape 2 */}
              <div className="flex gap-4">
                <div className="bg-blue-600 text-white rounded-full w-10 h-10 flex items-center justify-center text-lg font-bold flex-shrink-0">
                  2
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-gray-900 mb-2">Ouvrez votre Word et cliquez où vous voulez la donnée</h4>
                  <div className="bg-gradient-to-r from-gray-50 to-gray-100 border-2 border-dashed border-gray-300 rounded-lg p-4">
                    <p className="text-gray-700 text-base">
                      Client : <span className="inline-block w-32 h-6 bg-yellow-200 animate-pulse rounded"></span>
                    </p>
                    <p className="text-xs text-gray-500 mt-3 italic flex items-center gap-1">
                      <span className="text-xl">👆</span>
                      Cliquez juste après &quot;Client : &quot; dans votre document
                    </p>
                  </div>
                </div>
              </div>

              {/* Étape 3 */}
              <div className="flex gap-4">
                <div className="bg-blue-600 text-white rounded-full w-10 h-10 flex items-center justify-center text-lg font-bold flex-shrink-0">
                  3
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-gray-900 mb-2">Faites Ctrl+V (ou Cmd+V sur Mac)</h4>
                  <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
                    <p className="text-gray-900 text-base">
                      Client : <span className="font-mono bg-green-200 px-3 py-1 rounded">&#123;&#123;nom_client&#125;&#125;</span>
                    </p>
                    <p className="text-sm text-green-700 mt-3 font-medium flex items-center gap-1">
                      <span className="text-xl">✨</span>
                      Parfait ! Quand vous ferez une proposition, ça deviendra : &quot;Client : Société ABC&quot;
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* NOUVELLE SECTION : Exemple concret du secteur télécom */}
          <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-6">
            <h3 className="font-bold text-amber-900 mb-4 flex items-center gap-2">
              <span className="text-2xl">📱</span>
              Exemple réel : Proposition mobile
            </h3>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                  <X className="w-4 h-4 text-red-600" />
                  AVANT (statique)
                </p>
                <div className="bg-white border border-gray-300 rounded-lg p-4 text-sm">
                  <p className="mb-2"><strong>Fournisseur actuel :</strong> Orange</p>
                  <p className="mb-2"><strong>Forfait mobile :</strong> 50 GB à 29,99€</p>
                  <p><strong>Nombre de lignes :</strong> 12</p>
                </div>
                <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                  <span>⚠️</span>
                  Il faut tout réécrire manuellement à chaque fois !
                </p>
              </div>
              
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                  <Check className="w-4 h-4 text-green-600" />
                  APRÈS (automatique)
                </p>
                <div className="bg-white border border-green-300 rounded-lg p-4 text-sm">
                  <p className="mb-2"><strong>Fournisseur actuel :</strong> <span className="font-mono bg-green-100 px-2 py-0.5 rounded text-xs">&#123;&#123;fournisseur&#125;&#125;</span></p>
                  <p className="mb-2"><strong>Forfait mobile :</strong> <span className="font-mono bg-green-100 px-2 py-0.5 rounded text-xs">&#123;&#123;forfait_actuel&#125;&#125;</span></p>
                  <p><strong>Nombre de lignes :</strong> <span className="font-mono bg-green-100 px-2 py-0.5 rounded text-xs">&#123;&#123;nb_lignes&#125;&#125;</span></p>
                </div>
                <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                  <span>✨</span>
                  Rempli automatiquement pour chaque client !
                </p>
              </div>
            </div>
          </div>

          {/* Section champs simples avec meilleur exemple */}
          <div id="variable-list-panel" className="bg-white border border-gray-200 rounded-xl p-6">
            <h4 className="font-semibold text-gray-900 mb-4 text-lg flex items-center gap-2">
              <span className="text-2xl">📝</span>
              Champs simples (informations uniques)
            </h4>
            
            {/* Exemple avant/après amélioré */}
            <div className="mb-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-gray-900 mb-3">Exemples concrets :</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border-2 border-gray-200 rounded-lg p-3 bg-white">
                  <p className="text-xs text-gray-500 mb-1">Dans Word (avant)</p>
                  <p className="text-sm text-gray-900 mb-3">Fournisseur :</p>
                  <p className="text-xs text-gray-500 mb-1">Dans Word (après)</p>
                  <p className="text-sm text-green-900 font-mono bg-green-50 p-2 rounded break-words">
                    Fournisseur : &#123;&#123;fournisseur&#125;&#125;
                  </p>
                </div>
                <div className="border-2 border-gray-200 rounded-lg p-3 bg-white">
                  <p className="text-xs text-gray-500 mb-1">Dans Word (avant)</p>
                  <p className="text-sm text-gray-900 mb-3">Nom du client :</p>
                  <p className="text-xs text-gray-500 mb-1">Dans Word (après)</p>
                  <p className="text-sm text-green-900 font-mono bg-green-50 p-2 rounded break-words">
                    Nom : &#123;&#123;client.nom&#125;&#125;
                  </p>
                </div>
              </div>
            </div>

            {/* Liste des champs */}
            <div id="btn-copy-variable" className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {champsSimples.map((field) => {
                const token = `{{${field}}}`;
                const copied = copiedKeys[token] !== undefined;

                return (
                  <div
                    key={field}
                    className={`flex items-center justify-between border rounded-lg px-3 py-2 transition-all ${
                      copied ? 'border-green-300 bg-green-50 shadow-sm' : 'border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <span className="text-sm font-mono text-gray-900">{token}</span>
                    <button
                      type="button"
                      onClick={() => copyAndMark(token, token)}
                      className={`text-sm px-3 py-1 border rounded transition-all ${
                        copied 
                          ? 'border-green-300 bg-white text-green-700 font-medium' 
                          : 'border-gray-300 hover:bg-gray-50 hover:border-blue-400'
                      }`}
                    >
                      {copied ? (
                        <span className="inline-flex items-center gap-1">
                          <Check className="w-4 h-4" />
                          Copié !
                        </span>
                      ) : (
                        '📋 Copier'
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* NOUVELLE SECTION TABLEAUX améliorée */}
          {arrayFields.length > 0 && (
            <div className="bg-purple-50 border-2 border-purple-300 rounded-xl p-6">
              <h3 className="font-bold text-purple-900 mb-4 flex items-center gap-2 text-lg">
                <span className="text-2xl">📊</span>
                Les tableaux (ex: liste de lignes mobiles)
              </h3>
              
              <div className="bg-white rounded-lg p-4 mb-4">
                <p className="text-sm text-gray-600 leading-relaxed mb-4">
                  Dans Word, créez votre tableau avec une ligne de données (les en-têtes au-dessus). Puis cliquez sur <strong className="text-purple-700">&quot;Copier pour Word&quot;</strong> ci-dessous et collez dans la <strong>1ère cellule</strong> de votre ligne — le système remplira automatiquement une ligne par entrée.
                </p>

                {/* Visuel avant/après */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-2">Votre tableau Word</p>
                    <div className="border-2 border-gray-300 rounded-lg overflow-hidden text-xs">
                      <table className="w-full">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="border border-gray-300 p-2 text-left">N°</th>
                            <th className="border border-gray-300 p-2 text-left">Utilisateur</th>
                            <th className="border border-gray-300 p-2 text-left">Forfait</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="bg-yellow-50">
                            <td className="border border-gray-300 p-2">
                              <span className="bg-yellow-200 px-2 py-1 rounded font-mono text-[10px]">&#123;&#123;numero&#125;&#125;</span>
                            </td>
                            <td className="border border-gray-300 p-2">
                              <span className="bg-yellow-200 px-2 py-1 rounded font-mono text-[10px]">&#123;&#123;utilisateur&#125;&#125;</span>
                            </td>
                            <td className="border border-gray-300 p-2">
                              <span className="bg-yellow-200 px-2 py-1 rounded font-mono text-[10px]">&#123;&#123;forfait&#125;&#125;</span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-yellow-700 mt-2">↑ Une seule ligne avec les variables</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-2">Résultat final (automatique)</p>
                    <div className="border-2 border-green-300 rounded-lg overflow-hidden text-xs">
                      <table className="w-full">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="border border-gray-300 p-2 text-left">N°</th>
                            <th className="border border-gray-300 p-2 text-left">Utilisateur</th>
                            <th className="border border-gray-300 p-2 text-left">Forfait</th>
                          </tr>
                        </thead>
                        <tbody className="bg-green-50">
                          <tr>
                            <td className="border border-gray-300 p-2">0612...</td>
                            <td className="border border-gray-300 p-2">Jean D.</td>
                            <td className="border border-gray-300 p-2">50GB</td>
                          </tr>
                          <tr>
                            <td className="border border-gray-300 p-2">0623...</td>
                            <td className="border border-gray-300 p-2">Marie L.</td>
                            <td className="border border-gray-300 p-2">100GB</td>
                          </tr>
                          <tr>
                            <td className="border border-gray-300 p-2">0634...</td>
                            <td className="border border-gray-300 p-2">Paul M.</td>
                            <td className="border border-gray-300 p-2">20GB</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-green-700 mt-2 flex items-center gap-1">
                      <span>✨</span>
                      Une ligne créée automatiquement pour chaque mobile !
                    </p>
                  </div>
                </div>
              </div>

              {/* Liste des tableaux */}
              <div className="space-y-4">
                {arrayFields.map((arr) => {
                  const startTag = `{{#${arr.id}}}`;
                  const endTag = `{{/${arr.id}}}`;
                  const startCopied = copiedKeys[startTag] !== undefined;
                  const endCopied = copiedKeys[endTag] !== undefined;
                  const rowKey = `row:${arr.id}`;
                  const rowCopied = copiedKeys[rowKey] !== undefined;
                  const rowFieldIds = arr.rowFields.map((rf) => rf.id);

                  const tableValidation = validationResults?.tables.find((t) => t.arrayId === arr.id);
                  const isAlreadyValid = tableValidation?.found && !tableValidation?.errors.some((e) => e.type === 'error') && (tableValidation?.missingFields.length ?? 0) === 0;
                  const hasTableErrors = tableValidation?.errors.some((e) => e.type === 'error');
                  const isAdvancedOpen = collapsedAdvanced[arr.id] === true;

                  return (
                    <div key={arr.id} className="border-2 border-purple-200 rounded-lg p-4 bg-white">
                      {/* Header */}
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <p className="font-bold text-gray-900 text-base">{arr.label || arr.id}</p>
                        {isAlreadyValid ? (
                          <span className="text-sm text-green-700 font-semibold bg-green-100 border border-green-300 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                            <Check className="w-4 h-4" />
                            Déjà configuré
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={rowFieldIds.length === 0}
                            onClick={() => handleCopyTableRow(arr.id, rowFieldIds)}
                            className={`text-sm px-4 py-2 border-2 rounded-lg font-semibold transition-all ${
                              rowCopied
                                ? 'border-green-300 bg-green-50 text-green-700'
                                : rowFieldIds.length === 0
                                  ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                                  : hasTableErrors
                                    ? 'border-orange-300 bg-orange-50 hover:bg-orange-100 text-orange-700'
                                    : 'border-purple-400 bg-purple-600 hover:bg-purple-700 text-white'
                            }`}
                          >
                            {rowCopied ? (
                              <span className="inline-flex items-center gap-1.5">
                                <Check className="w-4 h-4" />
                                Copié !
                              </span>
                            ) : hasTableErrors ? (
                              '🔄 Corriger'
                            ) : (
                              '📋 Copier pour Word'
                            )}
                          </button>
                        )}
                      </div>

                      {/* Instruction contextuelle */}
                      {!isAlreadyValid && rowFieldIds.length > 0 && !rowCopied && (
                        <p className="text-xs text-gray-500 mb-3">
                          Collez dans la <strong>première cellule de données</strong> de votre tableau Word (Ctrl+V)
                        </p>
                      )}
                      {rowCopied && (
                        <p className="text-xs text-green-600 font-medium mb-3 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" />
                          Collez maintenant dans la 1ère cellule de votre tableau Word (Ctrl+V)
                        </p>
                      )}

                      {/* Accordéon options avancées */}
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsedAdvanced((prev) => ({ ...prev, [arr.id]: !prev[arr.id] }))
                        }
                        className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
                      >
                        {isAdvancedOpen ? '▴' : '▾'} Options avancées
                      </button>

                      {isAdvancedOpen && (
                        <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                          {arr.rowFields.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-gray-600 mb-2">Champs individuels :</p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {arr.rowFields.map((rf) => {
                                  const rfTag = `{{${rf.id}}}`;
                                  const rfCopied = copiedKeys[rfTag] !== undefined;
                                  return (
                                    <div
                                      key={rf.id}
                                      className={`flex items-center justify-between border rounded px-3 py-2 ${
                                        rfCopied ? 'border-green-300 bg-green-50' : 'border-gray-200'
                                      }`}
                                    >
                                      <span className="text-xs font-mono text-gray-900">{rfTag}</span>
                                      <button
                                        type="button"
                                        onClick={() => copyAndMark(rfTag, rfTag)}
                                        className={`text-xs px-2 py-1 border rounded ${
                                          rfCopied ? 'border-green-300 bg-white text-green-700' : 'border-gray-300 hover:bg-gray-50'
                                        }`}
                                      >
                                        {rfCopied ? (
                                          <span className="inline-flex items-center gap-1">
                                            <Check className="w-3 h-3" />
                                            Copié
                                          </span>
                                        ) : (
                                          'Copier'
                                        )}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <div>
                            <p className="text-xs font-semibold text-gray-600 mb-2">Balises séparées :</p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => copyAndMark(startTag, startTag)}
                                className={`text-xs px-2 py-1 border rounded ${
                                  startCopied ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-300 hover:bg-gray-50 text-gray-600'
                                }`}
                              >
                                {startCopied ? '✓ Début copié' : "Balise d'ouverture"}
                              </button>
                              <button
                                type="button"
                                onClick={() => copyAndMark(endTag, endTag)}
                                className={`text-xs px-2 py-1 border rounded ${
                                  endCopied ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-300 hover:bg-gray-50 text-gray-600'
                                }`}
                              >
                                {endCopied ? '✓ Fin copiée' : 'Balise de fermeture'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Aperçu Word */}
          <div id="word-preview-panel" className="bg-white border border-gray-200 rounded-xl p-6">
            <h4 className="font-semibold text-gray-900 mb-4 text-lg flex items-center gap-2">
              <span className="text-2xl">👁️</span>
              Aperçu de votre document
            </h4>
            {file ? (
              <div className="border-2 border-gray-200 rounded-lg overflow-auto shadow-sm bg-white" style={{ minHeight: 420, maxHeight: 600 }}>
                {isRenderingDocx && (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 text-blue-600 animate-spin mr-3" />
                    <span className="text-gray-600">Génération de l&apos;aperçu...</span>
                  </div>
                )}
                {docxRenderError && !isRenderingDocx && (
                  <div className="p-8 text-center">
                    <p className="text-sm text-red-500">{docxRenderError}</p>
                  </div>
                )}
                <div ref={docxPreviewRef} className={isRenderingDocx ? 'hidden' : 'p-4'} />
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <p className="text-sm text-gray-500">Aucun aperçu disponible. Uploadez un fichier Word pour voir l&apos;aperçu.</p>
              </div>
            )}
          </div>

          {/* Upload nouvelle version */}
          <div className="border-2 border-dashed border-blue-300 rounded-xl p-8 bg-blue-50">
            <div className="text-center">
              <div className="mb-4">
                <label
                  htmlFor="word-final-upload"
                  className="cursor-pointer inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-md"
                >
                  <Upload className="w-5 h-5" />
                  Uploader une nouvelle version (.docx)
                </label>
                <input
                  id="word-final-upload"
                  type="file"
                  className="hidden"
                  accept=".docx"
                  onChange={handleWordFinalFileChange}
                />
              </div>
              <p className="text-sm text-blue-700 mb-2">
                <strong>Ajoutez vos variables dans Word, puis ré-uploadez ici</strong>
              </p>
              <p className="text-xs text-blue-600">
                L&apos;aperçu se mettra à jour automatiquement. Ensuite, cliquez sur &quot;Enregistrer et continuer&quot;.
              </p>
            </div>
          </div>

          {/* Boutons de navigation */}
          <div className="flex items-center justify-between pt-6 border-t-2 border-gray-200 gap-3">
            <button
              onClick={onPrev}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              ← Précédent
            </button>

            <div className="flex items-center gap-3">
              {onSave && (
                <button
                  type="button"
                  onClick={() => handleSaveWordTemplate(true)}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  💾 Sauvegarder
                </button>
              )}
              <button
                id="btn-validate-template"
                type="button"
                onClick={() => handleSaveWordTemplate(false)}
                disabled={hasCriticalValidationErrors}
                className={`px-8 py-3 rounded-lg transition-colors font-medium shadow-md ${
                  hasCriticalValidationErrors
                    ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                ✅ Enregistrer et continuer
              </button>
            </div>
          </div>
          {hasCriticalValidationErrors && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800 font-medium">
                Vous ne pouvez pas continuer : corrigez d&apos;abord les erreurs critiques, puis ré-uploadez le .docx.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Étape 3 : Mapping multi-feuilles */}
      {step === 'map-sheets' && (
        <>
          {excelSheets.length > 0 && templateData.champs_actifs && templateData.champs_actifs.length > 0 ? (
            <div id="excel-mapping-panel">
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
            </div>
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
