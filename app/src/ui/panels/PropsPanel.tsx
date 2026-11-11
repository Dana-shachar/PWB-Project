import { DualHueSlider, Slider } from '../UIElements';
import { landMiddleColor } from '../../biome/plantTypes';
import { shadeColorFor } from '../../scene/fillLight';
import type { ColorStop } from '../../planet/colorRamp';
import { DiceIcon } from '../icons';
import type { PropSettings } from '../../props/propSettings';

// The Props section's controls (props/rockScatter.ts): rocks on the land chunk.
interface PropsPanelProps {
  props: PropSettings;
  onPropsChange: (changes: Partial<PropSettings>) => void;
  colorStops: ColorStop[]; // the land ramp, for the Hue spread track
}

const HUE_TRACK_STEP = 15;

export function PropsPanel({ props, onPropsChange, colorStops }: PropsPanelProps) {
  // The Hue track: the rock color at every turn from the ground's hue, at the chosen saturation (as Shadow hue's track).
  const ground = landMiddleColor(colorStops);
  const rockColorAt = (turn: number) => shadeColorFor(ground, turn, props.saturation, 1).getStyle();
  const stops: string[] = [];
  for (let turn = -180; turn <= 180; turn += HUE_TRACK_STEP) stops.push(rockColorAt(turn));
  const hueTrack = `linear-gradient(to right, ${stops.join(', ')})`;
  return (
    <>
      <Slider label="Boulders" value={props.boulders} onChange={(boulders) => onPropsChange({ boulders })} min={0} max={2} step={0.01} precision={2} description="How many large boulders lie below cliffs and rock faces." />
      <Slider label="Small rocks" value={props.smallRocks} onChange={(smallRocks) => onPropsChange({ smallRocks })} min={0} max={2} step={0.01} precision={2} description="How many small rocks lie below cliffs and around boulders. They show only near the camera." />
      <Slider label="Shore rocks" value={props.shoreRocks} onChange={(shoreRocks) => onPropsChange({ shoreRocks })} min={0} max={2} step={0.01} precision={2} description="How many small rocks lie along the sea and lake shores." />
      <Slider label="Size" value={props.size} onChange={(size) => onPropsChange({ size })} min={0.25} max={3} step={0.01} precision={2} description="Scales every rock." />
      <Slider label="Largest boulder" value={props.largestBoulder} onChange={(largestBoulder) => onPropsChange({ largestBoulder })} min={2} max={1000} scale="log" step={1} precision={0} unit="m" description="How big the biggest boulders get. Few reach it; most stay small." />
      <Slider label="Draw distance" value={props.drawDistance} onChange={(drawDistance) => onPropsChange({ drawDistance })} min={1} max={100} scale="log" step={0.1} precision={1} unit="km" description="How far from the camera rocks are drawn. Shorter is faster; haze hides far rocks anyway." />
      <Slider label="Patchiness" value={props.patchiness} onChange={(patchiness) => onPropsChange({ patchiness })} min={0} max={1} step={0.01} precision={2} description="Even spread at 0; rock fields with clear stretches between them at 1." />
      <Slider label="Reach" value={props.reach} onChange={(reach) => onPropsChange({ reach })} min={20} max={45} step={1} precision={0} unit="°" description="How far fallen rocks roll out from a cliff: they stop where a line this steep from above meets the ground. Lower reaches farther." />
      <Slider label="Saturation" value={props.saturation} onChange={(saturation) => onPropsChange({ saturation })} min={0} max={1} step={0.01} precision={2} description="How colorful rocks are, as a share of the ground's color: 0 gray, 1 as colorful as the ground." />
      <DualHueSlider
        label="Hue"
        value={props.hueTurn}
        secondOffset={props.hueRange}
        onChange={(hueTurn) => onPropsChange({ hueTurn })}
        onSecondOffsetChange={(hueRange) => onPropsChange({ hueRange })}
        trackBackground={hueTrack}
        swatchColor={rockColorAt(props.hueTurn)}
        secondSwatchColor={rockColorAt(props.hueTurn + props.hueRange)}
        description="The range of hues rocks take, as turns from the ground's color: each rock picks one between the two handles."
      />
      <button type="button" className="noise-add-layer-btn ui-tooltip-anchor" onClick={() => onPropsChange({ seed: 1 + Math.floor(Math.random() * 1e6) })}>
        <DiceIcon /> Reroll
        <span className="ui-tooltip">New rock shapes and new places for every rock</span>
      </button>
    </>
  );
}
