import { RequestModel } from '../../shared/types';

export function withGraphqlKindWhenApplicable(request: RequestModel): RequestModel {
  return request.body.type === 'graphql' && request.method === 'POST' ? { ...request, kind: 'graphql' } : request;
}
