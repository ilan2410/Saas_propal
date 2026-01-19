import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import ExcelJS from 'exceljs';

// POST /api/templates/parse-excel
// Parse un fichier Excel (uploadé ou via URL) et retourne les feuilles et cellules
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let buffer: ArrayBuffer;
    let fileName = 'template.xlsx';

    // Vérifier le Content-Type pour déterminer le format de la requête
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      // Requête JSON avec URL du fichier
      const body = await request.json();
      const { fileUrl } = body;

      if (!fileUrl) {
        return NextResponse.json({ error: 'No fileUrl provided' }, { status: 400 });
      }

      // Télécharger le fichier depuis l'URL
      console.log('📥 Téléchargement du fichier Excel:', fileUrl);
      const response = await fetch(fileUrl);
      
      if (!response.ok) {
        return NextResponse.json({ 
          error: 'Failed to download file', 
          details: `Status: ${response.status}` 
        }, { status: 400 });
      }

      buffer = await response.arrayBuffer();
      fileName = fileUrl.split('/').pop() || 'template.xlsx';
    } else {
      // Requête FormData avec fichier uploadé
      const formData = await request.formData();
      const file = formData.get('file') as File;

      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }

      // Vérifier que c'est un fichier Excel
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (extension !== 'xlsx' && extension !== 'xls') {
        return NextResponse.json({ error: 'Only Excel files are supported' }, { status: 400 });
      }

      buffer = await file.arrayBuffer();
      fileName = file.name;
    }

    // Parser avec ExcelJS
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    // Fonction pour convertir un numéro de colonne en lettre Excel
    const getColumnName = (colNumber: number): string => {
      let name = '';
      let num = colNumber;
      while (num > 0) {
        const remainder = (num - 1) % 26;
        name = String.fromCharCode(65 + remainder) + name;
        num = Math.floor((num - 1) / 26);
      }
      return name;
    };

    // Extraire les informations des feuilles
    const sheets = workbook.worksheets.map((worksheet) => {
      const cells: { [key: string]: string } = {};
      const preview: { ref: string; value: string }[] = [];

      // Déterminer les vraies dimensions
      let maxRow = 0;
      let maxCol = 0;

      // Parcourir les cellules avec contenu
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber > 100) return; // Limiter à 100 lignes
        maxRow = Math.max(maxRow, rowNumber);

        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          if (colNumber > 26) return; // Limiter à 26 colonnes (A-Z)
          maxCol = Math.max(maxCol, colNumber);

          if (cell.value !== null && cell.value !== undefined) {
            const cellRef = `${getColumnName(colNumber)}${rowNumber}`;
            let value = '';
            
            // Gérer les différents types de valeurs
            if (typeof cell.value === 'object') {
              if ('richText' in cell.value) {
                value = cell.value.richText.map((rt: any) => rt.text).join('');
              } else if ('text' in cell.value) {
                value = String(cell.value.text);
              } else if ('result' in cell.value) {
                value = String(cell.value.result);
              } else {
                value = JSON.stringify(cell.value);
              }
            } else {
              value = String(cell.value);
            }
            
            value = value.substring(0, 100);
            cells[cellRef] = value;

            if (preview.length < 30) {
              preview.push({ ref: cellRef, value });
            }
          }
        });
      });

      return {
        name: worksheet.name,
        rows: Math.max(maxRow, worksheet.rowCount || 0, 50),
        cols: Math.max(maxCol, worksheet.columnCount || 0, 10),
        cells,
        preview,
      };
    });

    return NextResponse.json({
      success: true,
      fileName,
      sheets,
      sheetCount: workbook.worksheets.length,
    });
  } catch (error) {
    console.error('Error parsing Excel:', error);
    return NextResponse.json(
      {
        error: 'Failed to parse Excel file',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
