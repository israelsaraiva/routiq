import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { ComponentPropsWithoutRef, forwardRef, HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';
import { Icon } from '../../Icon';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof DialogPrimitive.Content>>(
  function DialogContent({ className, children, ...props }, ref) {
    return (
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ui-overlay" />
        <DialogPrimitive.Content ref={ref} className={cn('ui-dialog', className)} {...props}>
          {children}
          <DialogPrimitive.Close className="ui-button ui-button-ghost ui-button-icon ui-dialog-close" aria-label="Close">
            <Icon icon={Cancel01Icon} />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    );
  },
);

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ui-dialog-header', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ui-dialog-footer', className)} {...props} />;
}

export const DialogTitle = forwardRef<HTMLHeadingElement, ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(function DialogTitle(
  { className, ...props },
  ref,
) {
  return <DialogPrimitive.Title ref={ref} className={cn('ui-dialog-title', className)} {...props} />;
});

export const DialogDescription = forwardRef<HTMLParagraphElement, ComponentPropsWithoutRef<typeof DialogPrimitive.Description>>(
  function DialogDescription({ className, ...props }, ref) {
    return <DialogPrimitive.Description ref={ref} className={cn('ui-dialog-description', className)} {...props} />;
  },
);
