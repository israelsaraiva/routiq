import { REQUEST_TABS, RequestTab } from './RequestTabs';

export type EditorTab = RequestTab | 'query';

export interface EditorTabDefinition {
  id: EditorTab;
  label: string;
}

const GRAPHQL_HIDDEN_TABS: EditorTab[] = ['body'];

export const GRAPHQL_TABS: EditorTabDefinition[] = [
  { id: 'query', label: 'Query' },
  ...REQUEST_TABS.filter(({ id }) => !GRAPHQL_HIDDEN_TABS.includes(id)),
];
