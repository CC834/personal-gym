import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Body from 'react-muscle-highlighter';
import { BODY_MODEL_STORAGE_KEY, muscleLabel } from '../public/muscle-map.js';

const ALL_SLUGS = [
  'abs', 'adductors', 'ankles', 'biceps', 'calves', 'chest', 'deltoids', 'feet', 'forearm',
  'gluteal', 'hamstring', 'hair', 'hands', 'head', 'knees', 'lower-back', 'neck', 'obliques',
  'quadriceps', 'tibialis', 'trapezius', 'triceps', 'upper-back'
];

const roots = new Map();

function storedBodyModel() {
  const stored = localStorage.getItem(BODY_MODEL_STORAGE_KEY);
  return stored === 'female' ? 'female' : 'male';
}

function fillFor(part, picker, selectedMuscle) {
  if (picker && part.searchMuscle !== selectedMuscle) return 'color-mix(in srgb, var(--accent) 10%, var(--wash))';
  const amount = part.primary
    ? Math.round(64 + part.strength * 30)
    : Math.round(30 + part.strength * 20);
  return `color-mix(in srgb, var(--accent) ${amount}%, var(--wash))`;
}

function MuscleMap({ parts, interactive, compact, picker, onSelect }) {
  const [gender, setGender] = useState(storedBodyModel);
  const [selectedMuscle, setSelectedMuscle] = useState('');
  const activeSlugs = new Set(parts.map((part) => part.slug));
  const disabledParts = picker ? [] : ALL_SLUGS.filter((slug) => !activeSlugs.has(slug));
  const bodyData = parts.map((part) => ({
    slug: part.slug,
    styles: { fill: fillFor(part, picker, selectedMuscle), stroke: 'var(--surface-strong)', strokeWidth: 1 }
  }));
  const partBySlug = new Map(parts.map((part) => [part.slug, part]));
  const choices = [...new Map(parts.map((part) => [part.searchMuscle, part])).values()];

  useEffect(() => {
    if (!picker) return undefined;
    const syncSelection = (event) => setSelectedMuscle(event.detail ?? '');
    window.addEventListener('gym:muscle-filter', syncSelection);
    return () => window.removeEventListener('gym:muscle-filter', syncSelection);
  }, [picker]);

  function chooseGender(nextGender) {
    setGender(nextGender);
    localStorage.setItem(BODY_MODEL_STORAGE_KEY, nextGender);
  }

  function selectPart(slug) {
    if (!interactive && !picker) return;
    const part = partBySlug.get(slug);
    if (part) {
      setSelectedMuscle(part.searchMuscle);
      onSelect(part.searchMuscle);
    }
  }

  return <div className={`muscle-map${compact ? ' compact' : ''}`}>
    <div className="body-model-picker" role="group" aria-label="Body model">
      <button type="button" className={gender === 'male' ? 'active' : ''} aria-pressed={gender === 'male'} onClick={() => chooseGender('male')}>Male</button>
      <button type="button" className={gender === 'female' ? 'active' : ''} aria-pressed={gender === 'female'} onClick={() => chooseGender('female')}>Female</button>
    </div>
    {picker && <select className="muscle-picker-select field" aria-label="Choose a muscle" value={selectedMuscle} onChange={(event) => {
      const part = choices.find((choice) => choice.searchMuscle === event.target.value);
      if (part) selectPart(part.slug);
    }}>
      <option value="">Choose muscle</option>
      {choices.map((part) => <option key={part.searchMuscle} value={part.searchMuscle}>{muscleLabel(part.searchMuscle)}</option>)}
    </select>}
    <div className={`muscle-anatomy${interactive || picker ? ' interactive' : ''}`}>
      {['front', 'back'].map((side) => <figure key={side}>
        <figcaption>{side}</figcaption>
        <Body
          data={bodyData}
          side={side}
          gender={gender}
          disabledParts={disabledParts}
          defaultFill="var(--wash)"
          defaultStroke="var(--line)"
          defaultStrokeWidth={1}
          border="var(--line)"
          onBodyPartPress={interactive || picker ? (part) => selectPart(part.slug) : undefined}
        />
      </figure>)}
    </div>
    {!picker && <div className="muscle-legend"><span><i className="primary"></i>Primary</span><span><i className="secondary"></i>Secondary</span></div>}
    {interactive && !picker && <div className="muscle-choices" aria-label="Muscles trained">
      {choices.map((part) => <button type="button" key={part.searchMuscle} onClick={() => selectPart(part.slug)}>
        {part.searchMuscle === 'back' ? 'Back' : muscleLabel(part.searchMuscle)}
      </button>)}
    </div>}
    {interactive && !picker && <small className="muscle-map-hint">Choose a highlighted muscle to find exercises</small>}
    {picker && <small className="muscle-map-hint">Tap a muscle to filter exercises</small>}
  </div>;
}

export function unmountMuscleMaps(container) {
  for (const [host, root] of roots) {
    if (container && !container.contains(host)) continue;
    root.unmount();
    roots.delete(host);
  }
}

export function mountMuscleMaps(container, onSelect) {
  for (const host of container.querySelectorAll('[data-muscle-map]')) {
    let parts;
    try {
      parts = JSON.parse(decodeURIComponent(host.dataset.parts));
    } catch {
      host.innerHTML = '<p class="muscle-map-empty">Muscle map is unavailable.</p>';
      continue;
    }
    const root = createRoot(host);
    roots.set(host, root);
    root.render(<MuscleMap
      parts={parts}
      interactive={host.dataset.interactive === 'true'}
      compact={host.dataset.compact === 'true'}
      picker={host.dataset.picker === 'true'}
      onSelect={onSelect}
    />);
  }
}
