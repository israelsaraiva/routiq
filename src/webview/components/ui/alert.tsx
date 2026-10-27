import { cva, VariantProps } from 'class-variance-authority';
import { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

const alertVariants = cva('ui-alert', {
  variants: {
    variant: {
      default: 'ui-alert-default',
      destructive: 'ui-alert-destructive',
      success: 'ui-alert-success',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Alert({ className, variant, ...props }: HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>) {
  return <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

export function AlertTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ui-alert-title', className)} {...props} />;
}

export function AlertDescription({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ui-alert-description', className)} {...props} />;
}
