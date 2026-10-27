import { IconSvgElement } from '@hugeicons/react';
import { ButtonHTMLAttributes, forwardRef } from 'react';
import { Icon } from '../Icon';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Tooltip } from './ui/tooltip';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title' | 'aria-label' | 'children'> {
  icon: IconSvgElement;
  label: string;
  tooltip?: string;
  iconSize?: number;
  compact?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { icon, label, tooltip = label, iconSize, compact, className, ...props },
  ref,
) {
  return (
    <Tooltip content={tooltip}>
      <Button ref={ref} variant="ghost" size="icon" className={cn(compact && 'ui-button-compact', className)} aria-label={label} {...props}>
        <Icon icon={icon} size={iconSize} />
      </Button>
    </Tooltip>
  );
});
