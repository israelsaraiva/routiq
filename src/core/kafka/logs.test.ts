import { describe, expect, it } from 'vitest';
import { KafkaMessage } from '../../shared/types';
import { parseJsonFile } from './jsonLogParser';
import { filterBySearchQuery, filterByType, sortByTimestamp, uniqueContainers, uniqueLevels } from './logFilters';
import { convertToKafkaMessages } from './splunkMessages';

const entry = (level: string, container: string, flowId: string, time: string) => ({
  result: { level, _raw: JSON.stringify({ message: 'hello', flowId }), 'kubernetes.container_name': container, _time: time },
});

describe('parseJsonFile', () => {
  it('parses arrays, single objects and NDJSON', () => {
    expect(parseJsonFile(JSON.stringify([entry('info', 'a', 'f', '2024-01-01T00:00:00Z')])).entries).toHaveLength(1);
    const ndjson = [entry('info', 'a', 'f', '2024-01-01T00:00:00Z'), entry('error', 'b', 'g', '2024-01-01T00:00:01Z')].map((item) => JSON.stringify(item)).join('\n');
    expect(parseJsonFile(ndjson).entries).toHaveLength(2);
  });

  it('reports empty and invalid input', () => {
    expect(parseJsonFile('  ').error).toBe('File is empty');
    expect(parseJsonFile('garbage').error).toBe('Failed to parse any JSON entries');
  });

  it('keeps entries split across lines', () => {
    const pretty = JSON.stringify(entry('info', 'a', 'f', '2024-01-01T00:00:00Z'), null, 2);
    expect(parseJsonFile(`${pretty}\n${pretty}`).entries).toHaveLength(2);
  });
});

describe('splunk conversion and filters', () => {
  const messages: KafkaMessage[] = convertToKafkaMessages([
    entry('info', 'api', 'f1', '2024-01-01T00:00:00Z'),
    entry('error', 'worker', 'f2', '2024-01-01T00:00:05Z'),
  ] as never);

  it('derives level, container and flow id', () => {
    expect(messages.map((message) => message.level)).toEqual(['info', 'error']);
    expect(messages[0]).toMatchObject({ containerName: 'api', flowIdSource: 'splunk' });
    expect(messages[0].flowId.endsWith('-0')).toBe(true);
  });

  it('filters, searches and sorts', () => {
    expect(filterByType(messages, 'container', 'worker')).toHaveLength(1);
    expect(filterByType(messages, 'level', 'ERROR')).toHaveLength(1);
    expect(filterBySearchQuery(messages, 'api')).toHaveLength(1);
    expect(uniqueContainers(messages)).toEqual(['api', 'worker']);
    expect(uniqueLevels(messages)).toEqual(['error', 'info']);
    expect(sortByTimestamp(messages, false)[0].level).toBe('error');
  });
});
