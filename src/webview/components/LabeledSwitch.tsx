import { useId } from 'react';
import { Label } from './ui/label';
import { Switch } from './ui/switch';

interface Props {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  title?: string;
}

export function LabeledSwitch({ label, checked, onCheckedChange, title }: Props) {
  const id = useId();
  return (
    <div className="inline-check" title={title}>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}
