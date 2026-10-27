import { forwardRef, HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

function createDivPart(baseClass: string, displayName: string) {
  const Part = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Part({ className, ...props }, ref) {
    return <div ref={ref} className={cn(baseClass, className)} {...props} />;
  });
  Part.displayName = displayName;
  return Part;
}

export const Card = createDivPart('ui-card', 'Card');
export const CardHeader = createDivPart('ui-card-header', 'CardHeader');
export const CardTitle = createDivPart('ui-card-title', 'CardTitle');
export const CardDescription = createDivPart('ui-card-description', 'CardDescription');
export const CardContent = createDivPart('ui-card-content', 'CardContent');
