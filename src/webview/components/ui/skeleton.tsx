import { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('ui-skeleton', className)} {...props} />;
}
