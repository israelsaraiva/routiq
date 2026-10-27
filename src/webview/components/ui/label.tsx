import * as LabelPrimitive from '@radix-ui/react-label';
import { ComponentPropsWithoutRef, forwardRef } from 'react';
import { cn } from '../../lib/utils';

export const Label = forwardRef<HTMLLabelElement, ComponentPropsWithoutRef<typeof LabelPrimitive.Root>>(function Label(
  { className, ...props },
  ref,
) {
  return <LabelPrimitive.Root ref={ref} className={cn('ui-label', className)} {...props} />;
});
