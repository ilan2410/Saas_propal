Excellente idée ! Voici la validation améliorée qui vérifie la cohérence des variables lors du ré-upload :
tsx// À ajouter après les imports existants
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

// Fonction de validation à ajouter dans le composant
const validateWordVariables = (html: string): {
  simpleFields: { found: string[]; missing: string[] };
  tables: TableValidation[];
  errors: ValidationError[];
} => {
  const errors: ValidationError[] = [];
  
  // 1. Valider les champs simples
  const foundSimpleFields: string[] = [];
  const missingSimpleFields: string[] = [];
  
  champsSimples.forEach((field) => {
    const pattern = `{{${field}}}`;
    if (html.includes(pattern)) {
      foundSimpleFields.push(field);
    } else {
      missingSimpleFields.push(field);
    }
  });

  // 2. Valider les tableaux
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

    // Vérifier si les tags sont présents
    if (!hasStartTag && !hasEndTag) {
      // Tableau non utilisé - c'est OK
      return validation;
    }

    // Erreur : un seul tag présent
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
        details: 'Ajoutez la balise d\'ouverture au début de votre ligne de tableau',
      });
    }

    if (!validation.found) {
      return validation;
    }

    // Extraire le contenu entre les balises
    const startIndex = html.indexOf(startTag);
    const endIndex = html.indexOf(endTag);
    
    if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
      validation.errors.push({
        type: 'error',
        message: `Le tableau "${validation.arrayLabel}" a des balises dans le mauvais ordre`,
        details: 'La balise d\'ouverture doit être avant la balise de fermeture',
      });
      return validation;
    }

    const tableContent = html.substring(startIndex, endIndex + endTag.length);

    // Vérifier les champs du tableau
    arr.rowFields.forEach((rf) => {
      const fieldPattern = `{{${rf.id}}}`;
      if (tableContent.includes(fieldPattern)) {
        validation.foundFields.push(rf.id);
      } else {
        validation.missingFields.push(rf.id);
      }
    });

    // Détecter les variables supplémentaires (qui ne sont pas dans la config)
    const allFieldIds = arr.rowFields.map((rf) => rf.id);
    const variableRegex = /\{\{([^#/}][^}]*)\}\}/g;
    let match;
    const foundVariables = new Set<string>();
    
    while ((match = variableRegex.exec(tableContent)) !== null) {
      const varName = match[1];
      foundVariables.add(varName);
      if (!allFieldIds.includes(varName)) {
        validation.extraFields.push(varName);
      }
    }

    // Compter les colonnes dans le tableau Word (approximatif basé sur les <td>)
    const tdMatches = tableContent.match(/<td[^>]*>/g);
    if (tdMatches) {
      validation.columnCount = tdMatches.length;
      validation.expectedColumnCount = validation.foundFields.length + 2; // +2 pour les tags début/fin
    }

    // Générer les erreurs/warnings
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

    // Vérifier que les variables sont entre les balises
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

  // Erreurs globales
  if (foundSimpleFields.length === 0 && tableValidations.every((t) => !t.found)) {
    errors.push({
      type: 'error',
      message: 'Aucune variable détectée dans le document',
      details: 'Assurez-vous d\'avoir ajouté au moins quelques variables avant de continuer',
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

// État pour stocker les résultats de validation
const [validationResults, setValidationResults] = useState<{
  simpleFields: { found: string[]; missing: string[] };
  tables: TableValidation[];
  errors: ValidationError[];
} | null>(null);

const [hasUploadedBefore, setHasUploadedBefore] = useState(false);

// Modifier la fonction parseWordToPreview
async function parseWordToPreview(nextFile: File) {
  setStep('parse-word');
  setWordPreviewHtml(null);
  setWordParseError(null);
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
    setWordPreviewHtml(html || null);
    
    // VALIDATION : Seulement si c'est un ré-upload (pas le premier)
    if (html && hasUploadedBefore) {
      const validation = validateWordVariables(html);
      setValidationResults(validation);
    }
    
    // Marquer qu'un fichier a été uploadé
    setHasUploadedBefore(true);
    setStep('preview-word');
  } catch (error) {
    console.error('Erreur parsing Word:', error);
    setWordParseError('Erreur lors de la lecture du fichier Word');
    setStep('preview-word');
  }
}
Maintenant, ajoutez le composant visuel de validation dans le JSX, juste après l'en-tête du fichier dans step === 'preview-word' :
tsx{/* APRÈS l'en-tête du fichier et AVANT la section "Explication métaphorique" */}

{/* Résultats de validation (uniquement lors du ré-upload) */}
{validationResults && (
  <div className="space-y-4">
    {/* Erreurs critiques */}
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
              {error.details && (
                <p className="text-sm text-red-700 mt-1">{error.details}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    )}

    {/* Validation des tableaux */}
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

                  {/* Statut des balises */}
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

                  {/* Champs trouvés */}
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

                  {/* Champs manquants */}
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

                  {/* Variables inconnues */}
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

                  {/* Erreurs spécifiques */}
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
                          {error.details && (
                            <p className="text-xs mt-1">{error.details}</p>
                          )}
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

    {/* Résumé des champs simples */}
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

    {/* Bouton pour masquer la validation */}
    <button
      onClick={() => setValidationResults(null)}
      className="w-full py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50"
    >
      Masquer la validation
    </button>
  </div>
)}
🎯 Fonctionnalités de validation :
✅ Pour les champs simples :

Détecte quels champs sont présents dans le document
Liste les champs manquants (optionnel, pas bloquant)

✅ Pour les tableaux :

Vérification des balises :

Détecte si {{#arrayId}} est présent
Détecte si {{/arrayId}} est présent
Erreur si un seul des deux est présent
Erreur si l'ordre est inversé


Vérification des champs :

Liste les champs correctement placés
Liste les champs manquants (warning)
Détecte les variables inconnues (warning)


Vérification de la position :

Erreur si une variable de tableau est en dehors des balises


Affichage visuel :

🟢 Vert : Tout est OK
🟡 Jaune : Warnings (champs manquants)
🔴 Rouge : Erreurs critiques (balises manquantes/mal placées)