import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import mammoth from 'mammoth';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let buffer: ArrayBuffer;
    let fileName = 'template.docx';

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = (await request.json().catch(() => null)) as unknown;
      const fileUrl = isRecord(body) && typeof body.fileUrl === 'string' ? body.fileUrl : '';

      if (!fileUrl) {
        return NextResponse.json({ error: 'No fileUrl provided' }, { status: 400 });
      }

      const response = await fetch(fileUrl);
      if (!response.ok) {
        return NextResponse.json(
          { error: 'Failed to download file', details: `Status: ${response.status}` },
          { status: 400 }
        );
      }

      buffer = await response.arrayBuffer();
      fileName = fileUrl.split('/').pop() || 'template.docx';
    } else {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }

      const extension = file.name.split('.').pop()?.toLowerCase();
      if (extension !== 'docx') {
        return NextResponse.json({ error: 'Only .docx files are supported' }, { status: 400 });
      }

      buffer = await file.arrayBuffer();
      fileName = file.name;
    }

    const nodeBuffer = Buffer.from(buffer);

    const htmlResult = await mammoth.convertToHtml({ buffer: nodeBuffer });
    const textResult = await mammoth.extractRawText({ buffer: nodeBuffer });

    const htmlMax = 120_000;
    const textMax = 20_000;

    const html = (htmlResult.value || '').slice(0, htmlMax);
    const text = (textResult.value || '').slice(0, textMax);

    const variableRegex = /\{\{([^}]+)\}\}/g;
    const variables: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = variableRegex.exec(textResult.value || '')) !== null) {
      const v = (match[1] || '').trim();
      if (v) variables.push(v);
    }

    return NextResponse.json({
      success: true,
      fileName,
      html,
      text,
      variables: uniq(variables),
      messages: Array.isArray(htmlResult.messages) ? htmlResult.messages.map((m) => m.message) : [],
      truncated: {
        html: (htmlResult.value || '').length > htmlMax,
        text: (textResult.value || '').length > textMax,
      },
    });
  } catch (error) {
    console.error('Error parsing Word:', error);
    return NextResponse.json(
      {
        error: 'Failed to parse Word file',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
