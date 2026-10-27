import * as SeparatorPrimitive from '@radix-ui/react-separator';
import { ComponentPropsWithoutRef, forwardRef } from 'react';
import { cn } from '../../lib/utils';

export const Separator = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>>(function Separator(
  { className, orientation = 'horizontal', decorative = true, ...props },
  ref,
) {
  return (
    <SeparatorPrimitive.Root
      ref={ref}
      orientation={orientation}
      decorative={decorative}
      className={cn('ui-separator', `ui-separator-${orientation}`, className)}
      {...props}
    />
  );
});
