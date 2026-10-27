import { Badge } from '../../components/ui/badge';

interface Props {
  lag: number;
}

export function LagValue({ lag }: Props) {
  return <Badge variant={lag === 0 ? 'success' : 'warning'}>{lag.toLocaleString('en-US')}</Badge>;
}
