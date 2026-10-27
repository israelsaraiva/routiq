import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { ComponentPropsWithoutRef, forwardRef, HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';
import { buttonVariants } from './button';

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

export const AlertDialogContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>>(
  function AlertDialogContent({ className, ...props }, ref) {
    return (
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="ui-overlay" />
        <AlertDialogPrimitive.Content ref={ref} className={cn('ui-dialog', className)} {...props} />
      </AlertDialogPrimitive.Portal>
    );
  },
);

export function AlertDialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ui-dialog-header', className)} {...props} />;
}

export function AlertDialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ui-dialog-footer', className)} {...props} />;
}

export const AlertDialogTitle = forwardRef<HTMLHeadingElement, ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>>(
  function AlertDialogTitle({ className, ...props }, ref) {
    return <AlertDialogPrimitive.Title ref={ref} className={cn('ui-dialog-title', className)} {...props} />;
  },
);

export const AlertDialogDescription = forwardRef<HTMLParagraphElement, ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>>(
  function AlertDialogDescription({ className, ...props }, ref) {
    return <AlertDialogPrimitive.Description ref={ref} className={cn('ui-dialog-description', className)} {...props} />;
  },
);

export const AlertDialogAction = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>>(
  function AlertDialogAction({ className, ...props }, ref) {
    return <AlertDialogPrimitive.Action ref={ref} className={cn(buttonVariants({ variant: 'destructive' }), className)} {...props} />;
  },
);

export const AlertDialogCancel = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>>(
  function AlertDialogCancel({ className, ...props }, ref) {
    return <AlertDialogPrimitive.Cancel ref={ref} className={cn(buttonVariants({ variant: 'secondary' }), className)} {...props} />;
  },
);
