import { HugeiconsIcon, IconSvgElement } from '@hugeicons/react';

interface Props {
  icon: IconSvgElement;
  size?: number;
}

export function Icon({ icon, size = 16 }: Props) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.75} className="icon" />;
}
