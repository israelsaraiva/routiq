import { useCallback, useEffect, useState } from 'react';
import { GraphqlSchemaSummary, HostToWebviewMessage, RequestModel } from '../shared/types';
import { postToHost } from './vscodeApi';

export interface GraphqlSchemaState {
  schema?: GraphqlSchemaSummary;
  fetchedAt?: number;
  cached: boolean;
  fetching: boolean;
  error?: string;
}

const INITIAL_STATE: GraphqlSchemaState = { cached: false, fetching: false };

export function useGraphqlSchema(request: RequestModel) {
  const [state, setState] = useState<GraphqlSchemaState>(INITIAL_STATE);

  useEffect(() => {
    const onMessage = (event: MessageEvent<HostToWebviewMessage>) => {
      const message = event.data;
      if (message.type === 'graphqlSchemaFetching') {
        setState((current) => ({ ...current, fetching: true, error: undefined }));
      } else if (message.type === 'graphqlSchema') {
        setState({ schema: message.schema, fetchedAt: message.fetchedAt, cached: message.cached, fetching: false });
      } else if (message.type === 'graphqlSchemaError') {
        setState((current) => ({ ...current, fetching: false, error: message.message }));
      }
    };
    window.addEventListener('message', onMessage);
    postToHost({ type: 'graphqlLoadCachedSchema', request });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const fetchSchema = useCallback(() => postToHost({ type: 'graphqlFetchSchema', request }), [request]);

  return { state, fetchSchema };
}
