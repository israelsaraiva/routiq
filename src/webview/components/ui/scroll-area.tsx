import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { ComponentPropsWithoutRef, forwardRef } from 'react';
import { cn } from '../../lib/utils';
import { readStyleNonce } from '../../lib/nonce';

export const ScrollArea = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>>(function ScrollArea(
  { className, children, ...props },
  ref,
) {
  return (
    <ScrollAreaPrimitive.Root ref={ref} className={cn('ui-scroll-area', className)} {...props}>
      <ScrollAreaPrimitive.Viewport className="ui-scroll-viewport" nonce={readStyleNonce()}>{children}</ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar orientation="vertical" className="ui-scrollbar ui-scrollbar-vertical">
        <ScrollAreaPrimitive.Thumb className="ui-scroll-thumb" />
      </ScrollAreaPrimitive.Scrollbar>
      <ScrollAreaPrimitive.Scrollbar orientation="horizontal" className="ui-scrollbar ui-scrollbar-horizontal">
        <ScrollAreaPrimitive.Thumb className="ui-scroll-thumb" />
      </ScrollAreaPrimitive.Scrollbar>
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
});
