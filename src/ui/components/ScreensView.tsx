import { useState, type Dispatch } from 'react';
import type { ZmkConfig } from '../../core/config.ts';
import { COLLECTION_CREDIT, SCREENS, findScreen, type ScreenDef, type ScreenOption, type ScreenPreview } from '../../core/catalog/screens.ts';
import { moduleRevision, findModule } from '../../core/catalog/modules.ts';
import {
  readScreenOption,
  screenConflict,
  screenSlots,
  setScreen,
  setScreenEverywhere,
  setScreenOption,
  type ScreenSlot,
} from '../../core/screens.ts';
import type { EditorAction } from '../state/editorReducer.ts';
import { HelpLink } from '../help/HelpLink.tsx';
import { httpsUrl } from '../../core/url.ts';
import { Section } from './ui/Section.tsx';

interface ScreensViewProps {
  config: ZmkConfig;
  dispatch: Dispatch<EditorAction>;
  onKeyboard: () => void;
}

const imageUrl = (preview: ScreenPreview) => `${import.meta.env.BASE_URL}screens/${preview.file}`;

const onWhere = (slots: ScreenSlot[], id: string) => slots.filter((s) => s.screen?.id === id).map((s) => s.label);

/** Pick what each half's nice!view shows, from whoop-t's nice-shield-collection. */
export function ScreensView({ config, dispatch, onKeyboard }: ScreensViewProps) {
  const slots = screenSlots(config);
  const [selected, setSelected] = useState<string>(() => slots.find((s) => s.screen)?.screen?.id ?? SCREENS[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const version = config.west.zmkVersion;
  const detail = findScreen(selected);

  const apply = (change: () => ZmkConfig, notice: string) => {
    try {
      dispatch({ type: 'editConfig', config: change(), notice });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const use = (screen: ScreenDef | null, slot?: ScreenSlot) => {
    const name = screen?.name ?? 'The stock screen';
    const where = slot ? `on ${slot.label}` : slots.length > 1 ? 'on every half' : '';
    if (screen) setSelected(screen.id);
    apply(
      () => (slot ? setScreen(config, slot.index, screen?.id ?? null) : setScreenEverywhere(config, screen?.id ?? null)),
      `${name}${where ? ` ${where}` : ''}. Build & flash to put it on your keyboard.`,
    );
  };

  return (
    <div className="screens">
      <Section
        variant="flat"
        title="nice!view screens"
        icon="monitor"
        description={
          <>
            Choose what each nice!view shows. The designs come from the{' '}
            <a href={COLLECTION_CREDIT.url} target="_blank" rel="noopener noreferrer">
              nice-shield-collection
            </a>{' '}
            curated by{' '}
            <a href={COLLECTION_CREDIT.profile} target="_blank" rel="noopener noreferrer">
              {COLLECTION_CREDIT.name}
            </a>
            ; every card credits the person who made it (
            <a href={`${import.meta.env.BASE_URL}screens/LICENSES.txt`} target="_blank" rel="noopener noreferrer">
              licenses
            </a>
            ). <HelpLink to="screens" />
          </>
        }
      />

      {version !== 'v0.3' && (
        <div className="notice warn" role="alert">
          These screens are made for ZMK v0.3; switch the ZMK version at the top to use them.
        </div>
      )}
      {error && (
        <div className="notice warn" role="alert">
          {error}
        </div>
      )}

      {slots.length === 0 ? (
        <div className="notice" role="note">
          None of your builds has a nice!view. Turn on the nice!view for your keyboard (or add{' '}
          <code>nice_view_adapter nice_view</code> to its build) first.{' '}
          <button type="button" className="link-button" onClick={onKeyboard}>
            Keyboard settings
          </button>
        </div>
      ) : (
        <section className="screen-slots" aria-label="Your screens">
          {slots.map((slot) => (
            <div key={slot.index} className="screen-slot" aria-label={`${slot.label} screen`}>
              <span className="field-label">{slot.label}</span>
              <div className="screen-slot-body">
                {slot.screen?.previews[0] ? (
                  <img src={imageUrl(slot.screen.previews[0])} alt="" className="screen-slot-thumb" />
                ) : (
                  <span className="screen-slot-thumb stock" aria-hidden="true">
                    ZMK
                  </span>
                )}
                <div className="grow">
                  <strong>{slot.screen?.name ?? (slot.otherShield ? slot.otherShield : 'Stock nice!view')}</strong>
                  {slot.screen && (
                    <div className="row wrap small">
                      <button type="button" className="link-button" onClick={() => setSelected(slot.screen?.id ?? '')}>
                        Options
                      </button>
                      <button type="button" className="link-button" onClick={() => use(null, slot)}>
                        Back to stock
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="screens-layout">
        <div className="screen-grid">
          {SCREENS.map((screen) => (
            <ScreenCard
              key={screen.id}
              screen={screen}
              config={config}
              slots={slots}
              selected={screen.id === selected}
              onSelect={() => setSelected(screen.id)}
              onUse={(slot) => use(screen, slot)}
              onStock={(slot) => use(null, slot)}
            />
          ))}
        </div>
        {detail && <ScreenDetail screen={detail} config={config} slots={slots} dispatch={dispatch} />}
      </div>
    </div>
  );
}

interface ScreenCardProps {
  screen: ScreenDef;
  config: ZmkConfig;
  slots: ScreenSlot[];
  selected: boolean;
  onSelect: () => void;
  onUse: (slot?: ScreenSlot) => void;
  onStock: (slot: ScreenSlot) => void;
}

function ScreenCard({ screen, config, slots, selected, onSelect, onUse, onStock }: ScreenCardProps) {
  const where = onWhere(slots, screen.id);
  const module = findModule(screen.moduleId);
  const available = !!module && !!moduleRevision(module, config.west.zmkVersion);
  const preview = screen.previews[0];
  const everywhere = slots.length > 0 && where.length === slots.length;
  return (
    <article className={`screen-card${where.length > 0 ? ' in-use' : ''}${selected ? ' selected' : ''}`} aria-label={screen.name}>
      <button type="button" className="screen-card-preview" onClick={onSelect} aria-label={`Show ${screen.name}`}>
        {preview ? (
          <img src={imageUrl(preview)} alt={`${screen.name}: ${preview.caption}`} loading="lazy" className={preview.pixelArt ? 'pixel-art' : undefined} />
        ) : (
          <span className="muted small">No preview</span>
        )}
      </button>
      <div className="screen-card-body">
        <h3>{screen.name}</h3>
        <p className="muted small">
          by{' '}
          <a href={httpsUrl(screen.creator.url)} target="_blank" rel="noopener noreferrer">
            {screen.creator.name}
          </a>
          {screen.artOn === 'peripheral' && <span className="badge">Peripheral half art</span>}
          {where.length > 0 && <span className="badge in-use">On {where.join(' & ')}</span>}
        </p>
        {slots.length > 0 && (
          <div className="row wrap screen-card-actions" role="group" aria-label={`Use ${screen.name} on`}>
            {slots.length > 1 && (
              <button
                type="button"
                className={`button small${everywhere ? ' active' : ''}`}
                aria-pressed={everywhere}
                disabled={!available}
                onClick={() => onUse()}
              >
                Both
              </button>
            )}
            {slots.map((slot) => {
              const on = slot.screen?.id === screen.id;
              const conflict = screenConflict(config, slot.index, screen.id);
              return (
                <button
                  key={slot.index}
                  type="button"
                  className={`button small${on ? ' active' : ''}`}
                  aria-pressed={on}
                  disabled={!available || (!on && conflict !== undefined)}
                  title={conflict ?? (on ? `Put the stock screen back on ${slot.label}` : `Use on ${slot.label}`)}
                  onClick={() => (on ? onStock(slot) : onUse(slot))}
                >
                  {slots.length === 1 ? (on ? 'In use' : 'Use it') : slot.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </article>
  );
}

interface ScreenDetailProps {
  screen: ScreenDef;
  config: ZmkConfig;
  slots: ScreenSlot[];
  dispatch: Dispatch<EditorAction>;
}

function ScreenDetail({ screen, config, slots, dispatch }: ScreenDetailProps) {
  const where = onWhere(slots, screen.id);
  const conflicts = SCREENS.filter((s) => s.id !== screen.id && s.conflictGroup && s.conflictGroup === screen.conflictGroup);
  return (
    <aside className="screen-detail" aria-label={`${screen.name} details`}>
      <h3>{screen.name}</h3>
      <div className="screen-detail-previews">
        {screen.previews.map((p) => (
          <figure key={p.file}>
            <img src={imageUrl(p)} alt={`${screen.name}: ${p.caption}`} loading="lazy" className={p.pixelArt ? 'pixel-art' : undefined} />
            <figcaption className="muted small">{p.caption}</figcaption>
          </figure>
        ))}
      </div>
      <p className="small">{screen.description}</p>
      <dl className="screen-credits small">
        <dt>Made by</dt>
        <dd>
          <a href={httpsUrl(screen.creator.url)} target="_blank" rel="noopener noreferrer">
            {screen.creator.name}
          </a>
        </dd>
        <dt>Source</dt>
        <dd>
          <a className="mono" href={httpsUrl(screen.homepage)} target="_blank" rel="noopener noreferrer">
            {screen.homepage.replace('https://github.com/', '')}
          </a>
        </dd>
        <dt>License</dt>
        <dd>{screen.license}</dd>
        <dt>Shield</dt>
        <dd>
          <code>{screen.shield}</code>
        </dd>
      </dl>
      {screen.artOn === 'peripheral' && (
        <p className="muted small">Its art shows on the peripheral (usually right) half; on the central half it looks like the stock screen.</p>
      )}
      {conflicts.length > 0 && (
        <p className="muted small">
          Can’t share a keyboard with {conflicts.map((c) => c.name).join(', ')}, but it can go on every half.
        </p>
      )}
      {screen.options.length > 0 && (
        <div className="module-settings">
          <span className="field-label">Options</span>
          {where.length === 0 ? (
            <p className="muted small">Put it on a half to change its options.</p>
          ) : (
            <>
              {screen.options.map((option) => (
                <OptionField
                  key={option.symbol}
                  option={option}
                  value={readScreenOption(config, option)}
                  onChange={(value) => dispatch({ type: 'editConfig', config: setScreenOption(config, option, value) })}
                />
              ))}
              <p className="muted small">Saved in {config.keyboard}.conf, for every half.</p>
            </>
          )}
        </div>
      )}
    </aside>
  );
}

function OptionField({ option, value, onChange }: { option: ScreenOption; value: boolean | number; onChange: (value: boolean | number) => void }) {
  if (option.kind === 'bool') {
    return (
      <div>
        <label className="check">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          {option.label}
        </label>
        {option.help && <p className="muted small screen-option-help">{option.help}</p>}
      </div>
    );
  }
  return (
    <label className="field">
      <span className="field-label">
        {option.label}
        {option.unit ? ` (${option.unit})` : ''}
      </span>
      <input
        className="input"
        type="number"
        min={option.min}
        max={option.max}
        defaultValue={Number(value)}
        key={Number(value)}
        onBlur={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next) && next >= (option.min ?? 0) && next !== value) onChange(next);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      {option.help && <span className="muted small">{option.help}</span>}
    </label>
  );
}
