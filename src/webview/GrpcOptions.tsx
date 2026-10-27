import { Add01Icon, Delete02Icon, RefreshIcon } from '@hugeicons/core-free-icons';
import { useCallback, useEffect } from 'react';
import { addUniquePath, describeCallShape, methodKey, parseMethodKey, removePathAt, selectedMethod, shouldReplaceMessage, usesReflection } from '../core/grpcConfig';
import { DEFAULT_GRPC_CONFIG, GrpcConfig, GrpcServiceDescription, HostToWebviewMessage, RequestModel } from '../shared/types';
import { Icon } from './Icon';
import { IconButton } from './components/IconButton';
import { LabeledSwitch } from './components/LabeledSwitch';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from './components/ui/select';
import { postToHost } from './vscodeApi';

const REFLECTION_RELOAD_DELAY_MS = 600;

interface Props {
  request: RequestModel;
  services: GrpcServiceDescription[];
  loadError?: string;
  onChange: (patch: Partial<RequestModel>) => void;
}

interface PathListProps {
  label: string;
  paths: string[];
  onAdd: () => void;
  onRemove: (index: number) => void;
}

function PathList({ label, paths, onAdd, onRemove }: PathListProps) {
  return (
    <div className="response-toolbar">
      <span className="stream-detail">{label}</span>
      {paths.map((path, index) => (
        <Badge variant="secondary" className="kind-badge" key={path} title={path}>
          {path.split(/[\\/]/).pop()}
          <IconButton icon={Delete02Icon} iconSize={12} label={`Remove ${path}`} tooltip={path} onClick={() => onRemove(index)} />
        </Badge>
      ))}
      <Button variant="secondary" onClick={onAdd}>
        <Icon icon={Add01Icon} />
        Add
      </Button>
    </div>
  );
}

export function GrpcOptions({ request, services, loadError, onChange }: Props) {
  const config = request.grpc ?? DEFAULT_GRPC_CONFIG;
  const method = selectedMethod(services, config);

  const updateConfig = useCallback((patch: Partial<GrpcConfig>) => onChange({ grpc: { ...config, ...patch } }), [config, onChange]);
  const loadProto = useCallback(() => postToHost({ type: 'grpcLoadProto', request }), [request]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<HostToWebviewMessage>) => {
      const message = event.data;
      if (message.type === 'grpcPathPicked') {
        const key = message.pathKind === 'protoFile' ? 'protoFiles' : 'importPaths';
        updateConfig({ [key]: addUniquePath(config[key], message.path) });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [config, updateConfig]);

  const reflection = usesReflection(config);
  const protoKey = config.protoFiles.join('\n') + '\n' + config.importPaths.join('\n');
  useEffect(() => {
    if (reflection) {
      const timer = setTimeout(() => request.url.trim() !== '' && loadProto(), REFLECTION_RELOAD_DELAY_MS);
      return () => clearTimeout(timer);
    }
    if (config.protoFiles.length > 0) {
      loadProto();
    }
  }, [protoKey, reflection, request.url, config.tls]);

  const selectMethod = (key: string) => {
    const selection = parseMethodKey(key);
    const next = selectedMethod(services, { ...config, ...selection });
    const previousExample = method?.exampleBody;
    const replaceMessage = next && shouldReplaceMessage(request.body.text, previousExample);
    onChange({
      grpc: { ...config, ...selection },
      ...(replaceMessage ? { body: { ...request.body, type: 'json', text: next.exampleBody } } : {}),
    });
  };

  return (
    <div className="grpc-options">
      <div className="response-toolbar">
        <LabeledSwitch label="TLS" checked={config.tls} onCheckedChange={(tls) => updateConfig({ tls })} />
        <LabeledSwitch label="Use server reflection" checked={reflection} onCheckedChange={(useReflection) => updateConfig({ useReflection })} />
        <Select value={methodKey(config.service, config.method)} onValueChange={selectMethod}>
          <SelectTrigger aria-label="gRPC method">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={methodKey('', '')} disabled>
              {services.length === 0 ? (reflection ? 'Enter a URL to list services' : 'Load a .proto file') : 'Select method'}
            </SelectItem>
            {services.map((service) => (
              <SelectGroup key={service.name}>
                <SelectLabel>{service.name}</SelectLabel>
                {service.methods.map(({ name }) => (
                  <SelectItem key={name} value={methodKey(service.name, name)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        {method && <span className="stream-detail">{describeCallShape(method)}</span>}
        <Button variant="secondary" onClick={loadProto} disabled={!reflection && config.protoFiles.length === 0}>
          <Icon icon={RefreshIcon} />
          {reflection ? 'Refresh services' : 'Reload proto'}
        </Button>
      </div>
            {!reflection && (
        <>
          <PathList
            label="Proto files"
            paths={config.protoFiles}
            onAdd={() => postToHost({ type: 'grpcPickPath', pathKind: 'protoFile' })}
            onRemove={(index) => updateConfig({ protoFiles: removePathAt(config.protoFiles, index) })}
          />
          <PathList
            label="Import paths"
            paths={config.importPaths}
            onAdd={() => postToHost({ type: 'grpcPickPath', pathKind: 'importPath' })}
            onRemove={(index) => updateConfig({ importPaths: removePathAt(config.importPaths, index) })}
          />
        </>
      )}
      {loadError && <span className="filter-error">{loadError}</span>}
    </div>
  );
}
