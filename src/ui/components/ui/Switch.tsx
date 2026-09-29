import type { ComponentPropsWithoutRef } from 'react';

type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
} & Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'role' | 'checked' | 'onChange'>;

/** An on/off toggle: a checkbox with the switch role, drawn as a track and thumb. */
export function Switch({ checked, onChange, className, ...rest }: SwitchProps) {
  return (
    <input
      {...rest}
      type="checkbox"
      role="switch"
      className={['switch', className].filter(Boolean).join(' ')}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}
