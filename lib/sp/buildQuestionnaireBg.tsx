import React from 'react';
import type { SpCustomization } from '@/types';

export function buildQuestionnaireBgBackdrop(sp?: SpCustomization): React.ReactNode {
  const type = sp?.questionnaire_bg_type ?? 'none';
  if (type === 'none') return undefined;

  const opacity = (sp?.questionnaire_bg_opacity ?? 100) / 100;
  const blur = sp?.questionnaire_bg_blur ?? 0;
  const overlay = (sp?.questionnaire_bg_overlay ?? 0) / 100;

  let bgStyle: React.CSSProperties = {};
  if (type === 'color') {
    bgStyle = { backgroundColor: sp?.questionnaire_bg_color ?? '#1e3a5f' };
  } else if (type === 'gradient') {
    const g = sp?.questionnaire_bg_gradient ?? { from: '#1e3a5f', to: '#0d4073', direction: '135deg' };
    bgStyle = { background: `linear-gradient(${g.direction}, ${g.from}, ${g.to})` };
  } else if (type === 'image' && sp?.questionnaire_bg_url) {
    bgStyle = {
      backgroundImage: `url(${sp.questionnaire_bg_url})`,
      backgroundPosition: sp.questionnaire_bg_position ?? 'center',
      backgroundSize: sp.questionnaire_bg_size ?? 'cover',
      backgroundRepeat: sp.questionnaire_bg_repeat ?? 'no-repeat',
      filter: blur > 0 ? `blur(${blur}px)` : undefined,
    };
  } else {
    return undefined;
  }

  return (
    <div className="fixed inset-0 z-50" style={{ opacity, ...bgStyle }}>
      {overlay > 0 && (
        <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${overlay})` }} />
      )}
    </div>
  );
}
