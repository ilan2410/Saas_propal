'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, X, Check, AlertCircle, FileSpreadsheet, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

type ImportStep = 'upload' | 'mapping' | 'preview' | 'importing';

interface ImportProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
}

interface MappedField {
  systemField: string;
  fileHeader: string | null;
  required: boolean;
  label: string;
}

const SYSTEM_FIELDS: MappedField[] = [
  { systemField: 'nom', fileHeader: null, required: true, label: 'Nom du produit' },
  { systemField: 'categorie', fileHeader: null, required: true, label: 'Catégorie' },
  { systemField: 'description', fileHeader: null, required: false, label: 'Description' },
  { systemField: 'fournisseur', fileHeader: null, required: false, label: 'Fournisseur' },
  { systemField: 'type_frequence', fileHeader: null, required: false, label: 'Type (mensuel/unique)' },
  { systemField: 'prix_mensuel', fileHeader: null, required: false, label: 'Prix Mensuel' },
  { systemField: 'prix_vente', fileHeader: null, required: false, label: 'Prix de Vente' },
  { systemField: 'prix_installation', fileHeader: null, required: false, label: 'Frais Installation' },
  { systemField: 'engagement_mois', fileHeader: null, required: false, label: 'Engagement (mois)' },
  { systemField: 'image_url', fileHeader: null, required: false, label: 'Image URL' },
  { systemField: 'tags', fileHeader: null, required: false, label: 'Tags (séparés par virgules)' },
];

export function ImportProductModal({ isOpen, onClose, isAdmin = false }: ImportProductModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<ImportStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<unknown[][]>([]);
  const [mapping, setMapping] = useState<MappedField[]>(SYSTEM_FIELDS);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [successCount, setSuccessCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 });
        
        if (jsonData.length === 0) {
          alert('Le fichier est vide');
          return;
        }

        const fileHeaders = (jsonData[0] as string[]).map(h => String(h).trim());
        const fileRows = jsonData.slice(1) as unknown[][]; // Raw data rows

        setHeaders(fileHeaders);
        setData(fileRows);
        autoMapFields(fileHeaders);
        setStep('mapping');
      } catch (err) {
        console.error(err);
        alert('Erreur lors de la lecture du fichier');
      }
    };
    reader.readAsBinaryString(selectedFile);
  };

  const autoMapFields = (fileHeaders: string[]) => {
    const newMapping = [...SYSTEM_FIELDS].map(field => {
      // Simple heuristic: loose match
      const match = fileHeaders.find(h => 
        h.toLowerCase().includes(field.label.toLowerCase()) || 
        h.toLowerCase().includes(field.systemField.toLowerCase()) ||
        (field.systemField === 'prix_mensuel' && h.toLowerCase().includes('mensuel')) ||
        (field.systemField === 'prix_vente' && h.toLowerCase().includes('vente')) ||
        (field.systemField === 'prix_vente' && h.toLowerCase().includes('achat'))
      );
      return { ...field, fileHeader: match || null };
    });
    setMapping(newMapping);
  };

  const updateMapping = (systemField: string, fileHeader: string) => {
    setMapping(prev => prev.map(f => 
      f.systemField === systemField ? { ...f, fileHeader: fileHeader === 'ignore' ? null : fileHeader } : f
    ));
  };

  const processImport = async () => {
    setStep('importing');
    setImportErrors([]);
    setSuccessCount(0);

    const productsToImport = data.map((row) => {
      const product: Record<string, unknown> = {};
      mapping.forEach(m => {
        if (m.fileHeader) {
          const colIndex = headers.indexOf(m.fileHeader);
          if (colIndex !== -1) {
            product[m.systemField] = row[colIndex];
          }
        }
      });
      // Default values
      if (!product.categorie) product.categorie = 'autre';
      if (!product.type_frequence) product.type_frequence = 'mensuel';
      return product;
    });

    try {
      // Send batch to API
      const res = await fetch('/api/catalogue/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          products: productsToImport,
          is_global: isAdmin
        }),
      });

      const result = await res.json();
      
      if (result.success) {
        setSuccessCount(result.count);
        if (result.errors && result.errors.length > 0) {
          setImportErrors(result.errors);
        } else {
          setTimeout(() => {
            onClose();
            router.refresh();
          }, 1500);
        }
      } else {
        setImportErrors([result.error || 'Erreur inconnue']);
      }
    } catch (err) {
      setImportErrors(['Erreur réseau ou serveur']);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            Importer des produits
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {step === 'upload' && (
            <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
                 onClick={() => fileInputRef.current?.click()}>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".csv, .xls, .xlsx" 
                onChange={handleFileUpload}
              />
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Upload className="w-8 h-8" />
              </div>
              <p className="text-lg font-medium text-gray-900">Cliquez pour choisir un fichier</p>
              <p className="text-sm text-gray-500 mt-1">CSV, Excel (.xls, .xlsx)</p>
            </div>
          )}

          {step === 'mapping' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 mb-4">Associez les colonnes de votre fichier aux champs du catalogue.</p>
              <div className="space-y-2">
                {mapping.map((field) => (
                  <div key={field.systemField} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                    <div className="w-1/3">
                      <p className="font-medium text-gray-900">{field.label}</p>
                      {field.required && <span className="text-xs text-red-500">* Requis</span>}
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                    <div className="flex-1">
                      <select
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                        value={field.fileHeader || 'ignore'}
                        onChange={(e) => updateMapping(field.systemField, e.target.value)}
                      >
                        <option value="ignore">-- Ignorer ce champ --</option>
                        {headers.map((h, i) => (
                          <option key={i} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="text-center py-12">
              {importErrors.length > 0 ? (
                <div className="text-red-600">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">Erreur d&apos;importation</h3>
                  <p className="mb-4">{successCount} produits importés avec succès.</p>
                  <div className="text-left bg-red-50 p-4 rounded-lg text-sm max-h-40 overflow-y-auto">
                    <ul className="list-disc pl-4">
                      {importErrors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : successCount > 0 ? (
                <div className="text-green-600">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold">Importation réussie !</h3>
                  <p>{successCount} produits ajoutés.</p>
                </div>
              ) : (
                <div className="text-blue-600">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                    <Upload className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold">Importation en cours...</h3>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          {step === 'mapping' && (
            <>
              <button
                onClick={() => setStep('upload')}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Retour
              </button>
              <button
                onClick={processImport}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                Importer {data.length} produits
              </button>
            </>
          )}
          {step === 'importing' && importErrors.length > 0 && (
             <button
             onClick={() => setStep('upload')}
             className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
           >
             Réessayer
           </button>
          )}
        </div>
      </div>
    </div>
  );
}
