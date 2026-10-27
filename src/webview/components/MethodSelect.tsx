import { HTTP_METHODS, HttpMethod } from '../../shared/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface Props {
  value: HttpMethod;
  onValueChange: (method: HttpMethod) => void;
}

function MethodPill({ method }: { method: HttpMethod }) {
  return (
    <span className="method-pill" data-method={method}>
      {method}
    </span>
  );
}

export function MethodSelect({ value, onValueChange }: Props) {
  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as HttpMethod)}>
      <SelectTrigger aria-label="HTTP method" className="method-trigger" data-method={value}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="method-content">
        {HTTP_METHODS.map((method) => (
          <SelectItem key={method} value={method}>
            <MethodPill method={method} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
