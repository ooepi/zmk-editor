import { Icon } from './Icon.tsx';

/** In place of a view ZMK Studio can't change, while the keymap came from a keyboard with no repository. */
export function StudioOnlyNote({ area, device, onOpenGitHub }: { area: string; device: string; onOpenGitHub: () => void }) {
  return (
    <section className="studio-only-note" aria-label="Needs your config">
      <span className="studio-only-icon" aria-hidden="true">
        <Icon name="usb" size={22} />
      </span>
      <h2>{area} need your config</h2>
      <p>
        This keymap came from {device} through ZMK Studio, which changes keys and layers only. To change {area.toLowerCase()} and build new
        firmware, open your zmk-config from GitHub.
      </p>
      <button type="button" className="button primary" onClick={onOpenGitHub}>
        <Icon name="github" size={16} />
        Open your config from GitHub
      </button>
    </section>
  );
}
