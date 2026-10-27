import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

export interface SelectOption<Value extends string> {
  value: Value;
  label: string;
}

interface Props<Value extends string> {
  value: Value;
  options: Array<SelectOption<Value>>;
  onValueChange: (value: Value) => void;
  ariaLabel: string;
  className?: string;
  placeholder?: string;
}

export function OptionSelect<Value extends string>({ value, options, onValueChange, ariaLabel, className, placeholder }: Props<Value>) {
  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as Value)}>
      <SelectTrigger aria-label={ariaLabel} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function toSelectOptions<Value extends string>(entries: Array<{ id: Value; label: string }>): Array<SelectOption<Value>> {
  return entries.map(({ id, label }) => ({ value: id, label }));
}
