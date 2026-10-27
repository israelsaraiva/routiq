import { GrpcConfig, GrpcMethodDescription, GrpcServiceDescription } from '../shared/types';
import { findMethod } from './grpcDescribe';

export function addUniquePath(paths: string[], path: string): string[] {
  return paths.includes(path) ? paths : [...paths, path];
}

export function removePathAt(paths: string[], index: number): string[] {
  return paths.filter((_path, position) => position !== index);
}

export function selectedMethod(services: GrpcServiceDescription[], config: GrpcConfig): GrpcMethodDescription | undefined {
  return findMethod(services, config.service, config.method);
}

export function methodKey(service: string, method: string): string {
  return `${service}/${method}`;
}

export function parseMethodKey(key: string): Pick<GrpcConfig, 'service' | 'method'> {
  const separator = key.lastIndexOf('/');
  return separator < 0 ? { service: '', method: '' } : { service: key.slice(0, separator), method: key.slice(separator + 1) };
}

export function shouldReplaceMessage(currentText: string, previousExample: string | undefined): boolean {
  return currentText.trim() === '' || currentText === previousExample;
}

export function describeCallShape(method: Pick<GrpcMethodDescription, 'requestStream' | 'responseStream'>): string {
  if (method.requestStream) {
    return method.responseStream ? 'Bidirectional streaming' : 'Client streaming';
  }
  return method.responseStream ? 'Server streaming' : 'Unary';
}

export function allowsComposer(method: Pick<GrpcMethodDescription, 'requestStream'> | undefined): boolean {
  return method?.requestStream === true;
}
