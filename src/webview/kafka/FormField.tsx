import { ReactNode, useId } from 'react';
import { Label } from '../components/ui/label';

interface Props {
  label: string;
  children: (id: string) => ReactNode;
}

export function FormField({ label, children }: Props) {
  const id = useId();
  return (
    <div className="kafka-field">
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
    </div>
  );
}
