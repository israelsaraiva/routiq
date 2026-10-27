import { cva, VariantProps } from 'class-variance-authority';
import { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export const badgeVariants = cva('ui-badge', {
  variants: {
    variant: {
      default: 'ui-badge-default',
      secondary: 'ui-badge-secondary',
      outline: 'ui-badge-outline',
      success: 'ui-badge-success',
      warning: 'ui-badge-warning',
      destructive: 'ui-badge-destructive',
      info: 'ui-badge-info',
      status: 'ui-badge-status',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
