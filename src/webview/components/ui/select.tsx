import * as SelectPrimitive from '@radix-ui/react-select';
import { ArrowDown01Icon, ArrowUp01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { ComponentPropsWithoutRef, forwardRef } from 'react';
import { cn } from '../../lib/utils';
import { readStyleNonce } from '../../lib/nonce';
import { Icon } from '../../Icon';

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>>(
  function SelectTrigger({ className, children, ...props }, ref) {
    return (
      <SelectPrimitive.Trigger ref={ref} className={cn('ui-select-trigger', className)} {...props}>
        {children}
        <SelectPrimitive.Icon asChild>
          <Icon icon={ArrowDown01Icon} size={14} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
    );
  },
);

export const SelectContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof SelectPrimitive.Content>>(
  function SelectContent({ className, children, position = 'popper', ...props }, ref) {
    return (
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content ref={ref} position={position} sideOffset={4} className={cn('ui-select-content', className)} {...props}>
          <SelectPrimitive.ScrollUpButton className="ui-select-scroll-button">
            <Icon icon={ArrowUp01Icon} size={14} />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="ui-select-viewport" nonce={readStyleNonce()}>
            {children}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="ui-select-scroll-button">
            <Icon icon={ArrowDown01Icon} size={14} />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    );
  },
);

export const SelectItem = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof SelectPrimitive.Item>>(function SelectItem(
  { className, children, ...props },
  ref,
) {
  return (
    <SelectPrimitive.Item ref={ref} className={cn('ui-select-item', className)} {...props}>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="ui-select-item-indicator">
        <Icon icon={Tick02Icon} size={14} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
});

export const SelectGroup = SelectPrimitive.Group;

export const SelectLabel = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof SelectPrimitive.Label>>(function SelectLabel(
  { className, ...props },
  ref,
) {
  return <SelectPrimitive.Label ref={ref} className={cn('ui-select-label', className)} {...props} />;
});
