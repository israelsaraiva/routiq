import { Slot } from '@radix-ui/react-slot';
import { cva, VariantProps } from 'class-variance-authority';
import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/utils';

export const buttonVariants = cva('ui-button', {
  variants: {
    variant: {
      default: 'ui-button-default',
      secondary: 'ui-button-secondary',
      ghost: 'ui-button-ghost',
      destructive: 'ui-button-destructive',
    },
    size: {
      default: '',
      icon: 'ui-button-icon',
      sm: 'ui-button-sm',
    },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, type = 'button', ...props },
  ref,
) {
  const Component = asChild ? Slot : 'button';
  return <Component ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
