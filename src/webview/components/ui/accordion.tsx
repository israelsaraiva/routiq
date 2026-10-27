import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ArrowDown01Icon } from '@hugeicons/core-free-icons';
import { ComponentPropsWithoutRef, forwardRef } from 'react';
import { Icon } from '../../Icon';
import { cn } from '../../lib/utils';

export const Accordion = AccordionPrimitive.Root;

export const AccordionItem = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>>(function AccordionItem(
  { className, ...props },
  ref,
) {
  return <AccordionPrimitive.Item ref={ref} className={cn('ui-accordion-item', className)} {...props} />;
});

export const AccordionTrigger = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>>(function AccordionTrigger(
  { className, children, ...props },
  ref,
) {
  return (
    <AccordionPrimitive.Header className="ui-accordion-header">
      <AccordionPrimitive.Trigger ref={ref} className={cn('ui-accordion-trigger', className)} {...props}>
        {children}
        <Icon icon={ArrowDown01Icon} size={14} />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
});

export const AccordionContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>>(function AccordionContent(
  { className, children, ...props },
  ref,
) {
  return (
    <AccordionPrimitive.Content ref={ref} className={cn('ui-accordion-content', className)} {...props}>
      <div className="ui-accordion-body">{children}</div>
    </AccordionPrimitive.Content>
  );
});
