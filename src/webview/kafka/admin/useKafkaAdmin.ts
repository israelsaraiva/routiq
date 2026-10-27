import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { generateId } from '../../../core/ids';
import {
  KafkaAdminCommand,
  KafkaAdminCommandKind,
  KafkaAdminHostMessage,
  KafkaAdminResult,
  KafkaClusterInfo,
  KafkaGroupDetail,
  KafkaGroupSummary,
  KafkaTopicConfigEntry,
  KafkaTopicInfo,
} from '../../../shared/kafkaAdminTypes';
import { KafkaProfileDraft } from '../../../shared/types';
import { postKafkaMessage } from '../../vscodeApi';

export type KafkaAdminArea = 'topics' | 'groups' | 'cluster';

export interface KafkaAdminState {
  topics?: KafkaTopicInfo[];
  groups?: KafkaGroupSummary[];
  group?: KafkaGroupDetail;
  cluster?: KafkaClusterInfo;
  topicConfigs: Record<string, KafkaTopicConfigEntry[]>;
  pending: Record<string, KafkaAdminCommandKind>;
  errors: Partial<Record<KafkaAdminArea, string>>;
  notices: Partial<Record<KafkaAdminArea, string>>;
}

export type KafkaAdminAction =
  | { type: 'sent'; requestId: string; kind: KafkaAdminCommandKind }
  | { type: 'result'; result: KafkaAdminResult }
  | { type: 'reset' };

export const INITIAL_ADMIN_STATE: KafkaAdminState = { topicConfigs: {}, pending: {}, errors: {}, notices: {} };
export const DEFAULT_REFRESH_SECONDS = 10;

const AREA_BY_KIND: Record<KafkaAdminCommandKind, KafkaAdminArea> = {
  listTopics: 'topics',
  describeTopicConfigs: 'topics',
  createTopic: 'topics',
  deleteTopic: 'topics',
  alterTopicConfigs: 'topics',
  increasePartitions: 'topics',
  listGroups: 'groups',
  describeGroup: 'groups',
  deleteGroup: 'groups',
  resetGroupOffsets: 'groups',
  describeCluster: 'cluster',
};

export function adminAreaOf(kind: KafkaAdminCommandKind): KafkaAdminArea {
  return AREA_BY_KIND[kind];
}

function withoutRequest(pending: KafkaAdminState['pending'], requestId: string): KafkaAdminState['pending'] {
  const { [requestId]: _finished, ...rest } = pending;
  return rest;
}

function applyData(state: KafkaAdminState, result: KafkaAdminResult): KafkaAdminState {
  const { data } = result;
  const area = adminAreaOf(result.command);
  switch (data?.kind) {
    case 'topics':
      return { ...state, topics: data.topics };
    case 'topicConfigs':
      return { ...state, topicConfigs: { ...state.topicConfigs, [data.topic]: data.configs } };
    case 'groups':
      return { ...state, groups: data.groups };
    case 'group':
      return { ...state, group: data.group };
    case 'cluster':
      return { ...state, cluster: data.cluster };
    case 'done':
      return { ...state, notices: { ...state.notices, [area]: data.message } };
    default:
      return state;
  }
}

export function reduceAdminState(state: KafkaAdminState, action: KafkaAdminAction): KafkaAdminState {
  switch (action.type) {
    case 'reset':
      return INITIAL_ADMIN_STATE;
    case 'sent':
      return { ...state, pending: { ...state.pending, [action.requestId]: action.kind } };
    case 'result': {
      const { result } = action;
      const area = adminAreaOf(result.command);
      const settled = { ...state, pending: withoutRequest(state.pending, result.requestId), errors: { ...state.errors, [area]: result.error } };
      return result.error ? settled : applyData({ ...settled, notices: { ...settled.notices, [area]: undefined } }, result);
    }
  }
}

export function isAdminPending(state: KafkaAdminState, ...kinds: KafkaAdminCommandKind[]): boolean {
  return Object.values(state.pending).some((kind) => kinds.includes(kind));
}

function followUpCommand(command: KafkaAdminCommand): KafkaAdminCommand | undefined {
  switch (command.kind) {
    case 'createTopic':
    case 'deleteTopic':
      return { kind: 'listTopics' };
    case 'alterTopicConfigs':
      return command.validateOnly ? undefined : { kind: 'describeTopicConfigs', topic: command.topic };
    case 'increasePartitions':
      return { kind: 'listTopics' };
    case 'deleteGroup':
      return { kind: 'listGroups' };
    case 'resetGroupOffsets':
      return { kind: 'describeGroup', groupId: command.groupId };
    default:
      return undefined;
  }
}

export interface KafkaAdminApi {
  state: KafkaAdminState;
  refreshIntervalSeconds: number;
  send(command: KafkaAdminCommand): void;
}

export function useKafkaAdmin(profile: KafkaProfileDraft): KafkaAdminApi {
  const [state, dispatch] = useReducer(reduceAdminState, INITIAL_ADMIN_STATE);
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState(DEFAULT_REFRESH_SECONDS);
  const profileRef = useRef(profile);
  const sentCommands = useRef(new Map<string, KafkaAdminCommand>());
  profileRef.current = profile;

  const send = useCallback((command: KafkaAdminCommand) => {
    const requestId = generateId();
    sentCommands.current.set(requestId, command);
    dispatch({ type: 'sent', requestId, kind: command.kind });
    postKafkaMessage({ type: 'adminRequest', requestId, profile: profileRef.current, command });
  }, []);

  useEffect(() => {
    const onMessage = ({ data }: MessageEvent<KafkaAdminHostMessage>) => {
      if (data?.type === 'adminSettings') {
        setRefreshIntervalSeconds(data.refreshIntervalSeconds);
      }
      if (data?.type === 'adminResult') {
        const command = sentCommands.current.get(data.result.requestId);
        sentCommands.current.delete(data.result.requestId);
        dispatch({ type: 'result', result: data.result });
        const followUp = command && !data.result.error ? followUpCommand(command) : undefined;
        followUp && send(followUp);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [send]);

  const previousProfileId = useRef(profile.id);
  useEffect(() => {
    previousProfileId.current !== profile.id && dispatch({ type: 'reset' });
    previousProfileId.current = profile.id;
  }, [profile.id]);

  return { state, refreshIntervalSeconds, send };
}
