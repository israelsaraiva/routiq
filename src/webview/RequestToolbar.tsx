import { ArrowDataTransferHorizontalIcon, Copy01Icon, MoreHorizontalIcon, Settings02Icon, WifiConnected01Icon } from '@hugeicons/core-free-icons';
import { ConversionTarget } from '../core/requestConversion';
import { EnvironmentSummary } from '../shared/types';
import { Icon } from './Icon';
import { IconButton } from './components/IconButton';
import { Button } from './components/ui/button';
import { Label } from './components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';

interface Props {
  environments: EnvironmentSummary[];
  activeEnvironmentId?: string;
  onSelectEnvironment: (environmentId?: string) => void;
  onManageEnvironments: () => void;
  onCopyCurl: () => void;
  onDiagnoseNetwork?: () => void;
  conversionTarget?: ConversionTarget;
  onConvert?: (target: ConversionTarget) => void;
}

const CONVERSION_LABELS: Record<ConversionTarget, string> = { graphql: 'Convert to GraphQL', http: 'Convert to HTTP' };

const NO_ENVIRONMENT = '__no_environment__';

export function RequestToolbar({ environments, activeEnvironmentId, onSelectEnvironment, onManageEnvironments, onCopyCurl, onDiagnoseNetwork, conversionTarget, onConvert }: Props) {
  return (
    <div className="request-toolbar">
      <div className="environment-select">
        <Label>Environment</Label>
        <Select
          value={activeEnvironmentId ?? NO_ENVIRONMENT}
          onValueChange={(value) => onSelectEnvironment(value === NO_ENVIRONMENT ? undefined : value)}
        >
          <SelectTrigger aria-label="Environment">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_ENVIRONMENT}>No environment</SelectItem>
            {environments.map((environment) => (
              <SelectItem key={environment.id} value={environment.id}>
                {environment.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="request-toolbar-actions">
        <Button variant="secondary" size="sm" onClick={onCopyCurl} title="Copy this request as a cURL command">
          <Icon icon={Copy01Icon} />
          Copy cURL
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton className="toolbar-menu-trigger" icon={MoreHorizontalIcon} label="More actions" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={onManageEnvironments}>
              <Icon icon={Settings02Icon} />
              Manage environments
            </DropdownMenuItem>
            {onDiagnoseNetwork && (
              <DropdownMenuItem onSelect={onDiagnoseNetwork}>
                <Icon icon={WifiConnected01Icon} />
                Diagnose network
              </DropdownMenuItem>
            )}
            {conversionTarget && onConvert && (
              <DropdownMenuItem onSelect={() => onConvert(conversionTarget)}>
                <Icon icon={ArrowDataTransferHorizontalIcon} />
                {CONVERSION_LABELS[conversionTarget]}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
