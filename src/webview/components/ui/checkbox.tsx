import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Tick02Icon } from '@hugeicons/core-free-icons';
import { ComponentPropsWithoutRef, forwardRef } from 'react';
import { cn } from '../../lib/utils';
import { Icon } from '../../Icon';

export const Checkbox = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>>(function Checkbox(
  { className, ...props },
  ref,
) {
  return (
    <CheckboxPrimitive.Root ref={ref} className={cn('ui-checkbox', className)} {...props}>
      <CheckboxPrimitive.Indicator className="ui-checkbox-indicator">
        <Icon icon={Tick02Icon} size={12} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});
