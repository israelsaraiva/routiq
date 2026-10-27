import { KafkaFilterView, KafkaMessageViewMode, KafkaSavedFilter, KafkaUiState } from '../../shared/kafkaMessageTypes';
import { normalizeRules } from './highlightRules';
import { normalizeFilter } from './messageFilter';

const VIEW_MODES: KafkaMessageViewMode[] = ['tree', 'text', 'raw'];

export function defaultUiState(): KafkaUiState {
  return { savedFilters: [], views: [], rules: normalizeRules(undefined), viewMode: 'tree' };
}

function isNamedEntry(value: unknown): value is { id: string; name: string } {
  const candidate = value as { id?: unknown; name?: unknown } | null;
  return typeof candidate?.id === 'string' && typeof candidate.name === 'string';
}

function normalizeSavedFilters(stored: unknown): KafkaSavedFilter[] {
  return Array.isArray(stored) ? stored.filter(isNamedEntry).map(({ id, name, ...rest }) => ({ id, name, filter: normalizeFilter((rest as { filter?: unknown }).filter) })) : [];
}

function normalizeViews(stored: unknown): KafkaFilterView[] {
  return Array.isArray(stored)
    ? stored.filter(isNamedEntry).map((entry) => {
        const { topic, filter } = entry as unknown as { topic?: unknown; filter?: unknown };
        return { id: entry.id, name: entry.name, topic: typeof topic === 'string' ? topic : null, filter: normalizeFilter(filter) };
      })
    : [];
}

export function normalizeUiState(stored: unknown): KafkaUiState {
  const candidate = (typeof stored === 'object' && stored !== null ? stored : {}) as Partial<Record<keyof KafkaUiState, unknown>>;
  const viewMode = VIEW_MODES.find((mode) => mode === candidate.viewMode) ?? 'tree';
  return {
    savedFilters: normalizeSavedFilters(candidate.savedFilters),
    views: normalizeViews(candidate.views),
    rules: normalizeRules(candidate.rules),
    viewMode,
  };
}

export function mergeUiState(current: KafkaUiState, patch: Partial<KafkaUiState>): KafkaUiState {
  return normalizeUiState({ ...current, ...patch });
}
