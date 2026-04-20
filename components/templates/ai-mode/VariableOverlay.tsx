'use client';

import type { AISimpleVariable, AITable } from './types';

interface Props {
  variables: AISimpleVariable[];
  tables: AITable[];
  imageWidth: number;
  imageHeight: number;
  onVariableClick?: (v: AISimpleVariable) => void;
  onTableClick?: (t: AITable) => void;
}

/**
 * Overlay SVG par-dessus l'image d'une page.
 * Les positions des variables sont en coordonnées relatives (0..1).
 */
export function VariableOverlay({
  variables,
  tables,
  imageWidth,
  imageHeight,
  onVariableClick,
  onTableClick,
}: Props) {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox={`0 0 ${imageWidth} ${imageHeight}`}
      preserveAspectRatio="none"
    >
      {tables.map((t) => {
        const x = t.position.x * imageWidth;
        const y = t.position.y * imageHeight;
        const w = t.position.width * imageWidth;
        const h = t.position.height * imageHeight;
        return (
          <g key={t.id} className="pointer-events-auto cursor-pointer">
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill="rgba(168, 85, 247, 0.15)"
              stroke="rgb(147, 51, 234)"
              strokeWidth={2}
              strokeDasharray="4 2"
              onClick={() => onTableClick?.(t)}
            >
              <title>{t.label}</title>
            </rect>
            <text
              x={x + 4}
              y={y + 14}
              fontSize={12}
              fill="rgb(88, 28, 135)"
              fontWeight="bold"
              style={{ pointerEvents: 'none' }}
            >
              {t.label}
            </text>
          </g>
        );
      })}

      {variables.map((v) => {
        const x = v.position.x * imageWidth;
        const y = v.position.y * imageHeight;
        const w = v.position.width * imageWidth;
        const h = v.position.height * imageHeight;
        return (
          <g key={v.id} className="pointer-events-auto cursor-pointer">
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill="rgba(250, 204, 21, 0.25)"
              stroke="rgb(202, 138, 4)"
              strokeWidth={1.5}
              onClick={() => onVariableClick?.(v)}
            >
              <title>{`${v.label} → ${v.suggestedDataKey}`}</title>
            </rect>
            <text
              x={x + 2}
              y={Math.max(12, y - 2)}
              fontSize={10}
              fill="rgb(113, 63, 18)"
              fontWeight="bold"
              style={{ pointerEvents: 'none' }}
            >
              {v.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
