import { FloppyDiskIcon, Loading03Icon, SentIcon } from '@hugeicons/core-free-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_AUTO_SAVE_SETTINGS, isAutoSaveable } from '../core/autoSave';
import { toResponseModel } from '../core/history';
import { allowsComposer, selectedMethod } from '../core/grpcConfig';
import { conversionTargetOf } from '../core/requestConversion';
import { isStreamingRequest, kindLabel, requestKindOf } from '../core/requestKinds';
import {
  DEFAULT_GRPC_CONFIG, EnvironmentSummary, HistoryEntry, HostToWebviewMessage, KeyValue, RequestKind, RequestModel, ResponseModel, VariableSuggestion,
} from '../shared/types';
import { AutocompleteInput, VariableSuggestionsContext } from './AutocompleteInput';
import { MethodSelect } from './components/MethodSelect';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';
import { JsonTextEditor } from './JsonTextEditor';
import { RequestToolbar } from './RequestToolbar';
import { HistoryPanel } from './HistoryPanel';
import { Icon } from './Icon';
import { OAuthStatus, REQUEST_TABS, RequestTab, RequestTabContent } from './RequestTabs';
import { SplitPane } from './SplitPane';
import { GrpcOptions } from './GrpcOptions';
import { GraphqlEditor } from './GraphqlEditor';
import { GraphqlErrors } from './GraphqlErrors';
import { EditorTab, EditorTabDefinition, GRAPHQL_TABS } from './graphqlTabs';
import { extractGraphqlErrors } from '../core/graphql/errors';
import { StreamOptions } from './StreamOptions';
import { StreamPanel, streamTitle } from './StreamPanel';
import { useGrpcServices } from './useGrpcServices';
import { SaveStatus } from './SaveStatus';
import { useAutoSave } from './useAutoSave';
import { useStream } from './useStream';
import { CurlImportNotice, useCurlPaste } from './useCurlPaste';
import { ConversionNotice, useRequestConversion } from './useRequestConversion';
import { ResponseViewer } from './ResponseViewer';
import { postToHost } from './vscodeApi';

const HISTORY_TAB = 'history';

function isSaveShortcut(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's';
}

function countEnabled(rows: KeyValue[]): number {
  return rows.filter((row) => row.enabled && row.key.trim() !== '').length;
}

function TabCount({ count }: { count?: number }) {
  return count ? <Badge variant="default" className="tab-count" aria-label={`${count} active`}>{count}</Badge> : null;
}

const GRPC_TABS: Array<{ id: RequestTab; label: string }> = [
  { id: 'headers', label: 'Metadata' },
  { id: 'body', label: 'Message' },
];

function tabsFor(kind: RequestKind, streaming: boolean): EditorTabDefinition[] {
  if (kind === 'graphql') {
    return GRAPHQL_TABS;
  }
  if (kind === 'grpc') {
    return GRPC_TABS;
  }
  return streaming && kind !== 'http' ? REQUEST_TABS.filter(({ id }) => id !== 'body') : REQUEST_TABS;
}

export function App() {
  const [request, setRequest] = useState<RequestModel>();
  const [collectionName, setCollectionName] = useState('');
  const [response, setResponse] = useState<ResponseModel>();
  const [sending, setSending] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const [autoSaveSettings, setAutoSaveSettings] = useState(DEFAULT_AUTO_SAVE_SETTINGS);
  const dirtyRef = useRef(false);
  const requestRef = useRef<RequestModel>();
  const savingRequestRef = useRef<RequestModel>();
  const [tabSelection, setTabSelection] = useState<{ kind: RequestKind; tab: EditorTab }>();
  const stream = useStream();
  const grpcServices = useGrpcServices();
  const [oauthStatus, setOauthStatus] = useState<OAuthStatus>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [activeEnvironmentId, setActiveEnvironmentId] = useState<string>();
  const [variableSuggestions, setVariableSuggestions] = useState<VariableSuggestion[]>([]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<HostToWebviewMessage>) => {
      const message = event.data;
      if (message.type === 'load') {
        setRequest((current) => current ?? message.request);
        setCollectionName(message.collectionName);
      } else if (message.type === 'environmentState') {
        setEnvironments(message.environments);
        setActiveEnvironmentId(message.activeEnvironmentId);
      } else if (message.type === 'variableSuggestions') {
        setVariableSuggestions(message.variables);
      } else if (message.type === 'sending') {
        setSending(true);
      } else if (message.type === 'response') {
        setSending(false);
        setResponse(message.response);
      } else if (message.type === 'oauthTokenResult') {
        setOauthStatus({ ok: message.ok, message: message.message });
      } else if (message.type === 'saved') {
        setDirty(requestRef.current !== savingRequestRef.current);
        setSaving(false);
        setSavedOnce(true);
      } else if (message.type === 'autoSaveSettings') {
        setAutoSaveSettings({ enabled: message.enabled, delayMs: message.delayMs });
      }
    };
    window.addEventListener('message', onMessage);
    postToHost({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  requestRef.current = request;
  dirtyRef.current = dirty;

  const postSave = useCallback((target: RequestModel) => {
    savingRequestRef.current = target;
    setSaving(true);
    postToHost({ type: 'save', request: target });
  }, []);

  const autoSave = useAutoSave(autoSaveSettings, () => {
    const current = requestRef.current;
    if (current && dirtyRef.current && isAutoSaveable(current)) {
      postSave(current);
    }
  });

  const save = useCallback(() => {
    autoSave.cancel();
    if (request) {
      postSave(request);
    }
  }, [request, autoSave, postSave]);

  const showHistoryEntry = useCallback((entry: HistoryEntry) => {
    setSending(false);
    setResponse(toResponseModel(entry));
  }, []);

  const restoreHistoryEntry = useCallback((entry: HistoryEntry) => {
    setRequest((current) => current && { ...entry.requestSnapshot, id: current.id, name: current.name });
    setDirty(true);
    autoSave.touch();
    setHistoryOpen(false);
  }, [autoSave]);

  const applyRequest = useCallback((next: RequestModel) => {
    setRequest(next);
    setDirty(true);
    autoSave.touch();
  }, [autoSave]);
  const curlPaste = useCurlPaste(request, applyRequest);
  const conversion = useRequestConversion(request, applyRequest, (target) => {
    setTabSelection(target === 'graphql' ? { kind: 'graphql', tab: 'query' } : { kind: 'http', tab: 'body' });
    setHistoryOpen(false);
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isSaveShortcut(event)) {
        event.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [save]);

  if (!request) {
    return <div className="placeholder">Loading…</div>;
  }

  const change = (patch: Partial<RequestModel>) => {
    setRequest({ ...request, ...patch });
    setDirty(true);
    autoSave.touch();
  };
  const tabCounts: Partial<Record<EditorTab, number>> = {
    params: countEnabled(request.params),
    headers: countEnabled(request.headers),
  };
  const kind = requestKindOf(request);
  const streaming = isStreamingRequest(request);
  const visibleTabs = tabsFor(kind, streaming);
  const grpcMethod = selectedMethod(grpcServices.services, request.grpc ?? DEFAULT_GRPC_CONFIG);
  const selectedTab = tabSelection?.kind === kind ? tabSelection.tab : undefined;
  const activeTab = visibleTabs.find(({ id }) => id === selectedTab)?.id ?? visibleTabs[0].id;
  const hasEndpoint = request.url.trim() !== '';
  const send = () => {
    if (!hasEndpoint) return;
    postToHost(streaming ? { type: 'streamConnect', request } : { type: 'send', request });
  };
  const selectTab = (value: string) => {
    if (value === HISTORY_TAB) {
      setHistoryOpen(true);
      return;
    }
    setTabSelection({ kind, tab: value as EditorTab });
    setHistoryOpen(false);
  };

  return (
    <VariableSuggestionsContext.Provider value={variableSuggestions}>
    <div className="app">
      <div className="title">
        {collectionName} / {request.name}
        <SaveStatus dirty={dirty} saving={saving} saved={savedOnce} />
      </div>
      <RequestToolbar
        environments={environments}
        activeEnvironmentId={activeEnvironmentId}
        onSelectEnvironment={(environmentId) => postToHost({ type: 'setActiveEnvironment', environmentId })}
        onManageEnvironments={() => postToHost({ type: 'manageEnvironments' })}
        onCopyCurl={() => postToHost({ type: 'copyCurl', request })}
        onDiagnoseNetwork={() => postToHost({ type: 'diagnoseNetwork', request })}
        conversionTarget={conversionTargetOf(request)}
        onConvert={conversion.convert}
      />
      <div className="url-bar">
        <div className="request-group">
        {kind === 'http' ? (
          <MethodSelect value={request.method} onValueChange={(method) => change({ method })} />
        ) : (
          <Badge variant="secondary" className="kind-badge">{kindLabel(kind)}</Badge>
        )}
        <AutocompleteInput
          className="url-input"
          ariaLabel="Request URL"
          placeholder={kind === 'grpc' ? 'localhost:50051' : 'https://example.com/api/{{resource}}'}
          value={request.url}
          onChange={(url) => change({ url })}
          onKeyDown={(event) => event.key === 'Enter' && send()}
          onPasteText={kind === 'http' || kind === 'graphql' ? curlPaste.handlePaste : undefined}
        />
        {!streaming && (
          <Button className="send-button" onClick={send} disabled={sending || !hasEndpoint} title={hasEndpoint ? undefined : 'Enter a URL to send'} aria-busy={sending}>
            <Icon icon={sending ? Loading03Icon : SentIcon} />
            {sending ? 'Sending' : 'Send'}
          </Button>
        )}
        </div>
        <Input
          className="timeout-input"
          type="number"
          min={1}
          placeholder="Timeout ms"
          title="Timeout override in milliseconds (empty uses routiq.timeoutMs)"
          value={request.timeoutMs ?? ''}
          onChange={(event) => change({ timeoutMs: event.target.value === '' ? undefined : Number(event.target.value) })}
        />
        <Button variant="secondary" onClick={save} disabled={!dirty}>
          <Icon icon={FloppyDiskIcon} />
          Save
        </Button>
      </div>
      {conversion.notice && <ConversionNotice notice={conversion.notice} canUndo={conversion.canUndo} onUndo={conversion.undo} onDismiss={conversion.dismiss} />}
      {curlPaste.notice && <CurlImportNotice notice={curlPaste.notice} onUndo={curlPaste.undo} onDismiss={curlPaste.dismiss} />}
      {kind === 'grpc' ? (
        <GrpcOptions request={request} services={grpcServices.services} loadError={grpcServices.loadError} onChange={change} />
      ) : (
        kind !== 'graphql' && <StreamOptions request={request} kind={kind} onChange={change} />
      )}
      <SplitPane
        first={
          <>
      <Tabs value={historyOpen ? HISTORY_TAB : activeTab} onValueChange={selectTab}>
        <TabsList>
          {visibleTabs.map(({ id, label }) => (
            <TabsTrigger key={id} value={id}>
              {label}
              <TabCount count={tabCounts[id]} />
            </TabsTrigger>
          ))}
          <TabsTrigger value={HISTORY_TAB}>History</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="tab-content">
        <HistoryPanel visible={historyOpen} onShowEntry={showHistoryEntry} onRestoreEntry={restoreHistoryEntry} />
        {!historyOpen && (
          activeTab === 'query' ? (
            <GraphqlEditor request={request} onChange={change} />
          ) : kind === 'grpc' && activeTab === 'body' ? (
            <JsonTextEditor
              ariaLabel="gRPC request message (JSON)"
              placeholder='{"name": "{{user}}"}'
              text={request.body.text}
              onChange={(text) => change({ body: { ...request.body, type: 'json', text } })}
            />
          ) : (
          <RequestTabContent
            tab={activeTab}
            request={request}
            onChange={change}
            oauthStatus={oauthStatus}
            onFetchOAuthToken={() => postToHost({ type: 'fetchOAuthToken', request })}
          />
          )
        )}
      </div>
          </>
        }
        second={
          <>
            {streaming ? (
              <>
                <h3 className="section-title">{streamTitle(request)}</h3>
                <StreamPanel request={request} stream={stream} grpcMethodStreamsRequests={allowsComposer(grpcMethod)} />
              </>
            ) : (
              <>
                <h3 className="section-title">Response</h3>
                {kind === 'graphql' && response && <GraphqlErrors errors={extractGraphqlErrors(response.body)} />}
                <ResponseViewer response={response} sending={sending} onDiagnoseNetwork={() => postToHost({ type: 'diagnoseNetwork', request })} />
              </>
            )}
          </>
        }
      />
    </div>
    </VariableSuggestionsContext.Provider>
  );
}
