import { Add01Icon, RefreshIcon } from '@hugeicons/core-free-icons';
import { useEffect, useMemo, useState } from 'react';
import { filterTopics } from '../../../core/kafka/admin';
import { Icon } from '../../Icon';
import { LabeledSwitch } from '../../components/LabeledSwitch';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { EmptyState } from '../EmptyState';
import { AdminMessages } from './AdminMessages';
import { CreateTopicDialog } from './CreateTopicDialog';
import { TopicTable } from './TopicTable';
import { KafkaAdminApi, isAdminPending } from './useKafkaAdmin';
import './kafkaAdmin.css';

interface Props {
  admin: KafkaAdminApi;
  onAddToListener: (topic: string) => void;
  onConsume: (topic: string) => void;
}

export function TopicsPanel({ admin, onAddToListener, onConsume }: Props) {
  const { state, send } = admin;
  const [query, setQuery] = useState('');
  const [showInternal, setShowInternal] = useState(false);
  const [creating, setCreating] = useState(false);
  const visible = useMemo(() => filterTopics(state.topics ?? [], query, showInternal), [state.topics, query, showInternal]);
  const loading = isAdminPending(state, 'listTopics');

  const refresh = () => send({ kind: 'listTopics' });

  useEffect(() => {
    state.topics === undefined && refresh();
  }, []);

  return (
    <div className="kafka-messages">
      <div className="kafka-toolbar">
        <Input aria-label="Search topics" placeholder="Filter topics…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <LabeledSwitch label="Show internal" checked={showInternal} onCheckedChange={setShowInternal} />
        <Button variant="secondary" size="sm" onClick={refresh} disabled={loading}>
          <Icon icon={RefreshIcon} /> {loading ? 'Loading…' : 'Refresh'}
        </Button>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Icon icon={Add01Icon} /> New topic
        </Button>
      </div>
      <div className="kafka-scroll">
        <AdminMessages state={state} area="topics" />
        {state.topics === undefined && !state.errors.topics && (
          <EmptyState title={loading ? 'Loading topics…' : 'No topics loaded yet'} hint="Connect to a broker, then load its topics to browse, configure or consume them." actionLabel="Load topics" onAction={refresh} />
        )}
        {state.topics !== undefined && (
          <TopicTable
            topics={visible}
            configs={state.topicConfigs}
            onLoadConfigs={(topic) => send({ kind: 'describeTopicConfigs', topic })}
            onAddToListener={onAddToListener}
            onConsume={onConsume}
            onDelete={(topic) => send({ kind: 'deleteTopic', topic })}
            onAlterConfigs={(topic, changes, validateOnly) => send({ kind: 'alterTopicConfigs', topic, changes, validateOnly })}
            onIncreasePartitions={(topic, totalPartitions) => send({ kind: 'increasePartitions', topic, totalPartitions })}
          />
        )}
      </div>
      <CreateTopicDialog open={creating} onOpenChange={setCreating} onCreate={(topic) => send({ kind: 'createTopic', topic })} />
    </div>
  );
}
