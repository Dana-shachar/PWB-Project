import { Accordion } from '../UIElements';

interface StagePlaceholderProps {
  label: string;
}

// A pipeline stage with no real content yet (Climate/Biome/Population/
// Events) — one shared component instead of a near-identical file per
// stage, parameterized by label. Real content replaces this once that
// stage's own feature actually gets built.
export function StagePlaceholder({ label }: StagePlaceholderProps) {
  return (
    <div className="panel-section">
      <Accordion title={label}>
        <p className="stage-placeholder-text">Nothing built here yet.</p>
      </Accordion>
    </div>
  );
}
