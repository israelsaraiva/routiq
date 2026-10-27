import { RefreshIcon } from '@hugeicons/core-free-icons';
import { useMemo, useState } from 'react';
import { generateId } from '../../core/ids';
import { parseWholeNumber } from '../../core/kafka/sendJob';
import { ReplayPlan, planReplay } from '../../core/kafka/replayPlan';
import { KafkaJobProgress, KafkaReplayPartitionMode, KafkaReplayRequest } from '../../shared/kafkaProduceTypes';
import { KafkaMessage, KafkaProfileDraft, KafkaProfileView } from '../../shared/types';
import { Icon } from '../Icon';
import { LabeledSwitch } from '../components/LabeledSwitch';
import { OptionSelect } from '../components/OptionSelect';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { FormField } from './FormField';
import { JobProgressPanel } from './JobProgressPanel';

const PARTITION_MODE_OPTIONS: Array<{ value: KafkaReplayPartitionMode; label: string }> = [
  { value: 'auto', label: 'Automatic (by key)' },
  { value: 'original', label: 'Keep original partition' },
  { value: 'explicit', label: 'Explicit partition' },
];
const DRY_RUN_PREVIEW_LIMIT = 10;

interface Props {
  open: boolean;
  messages: KafkaMessage[];
  sourceProfile: KafkaProfileDraft;
  profiles: KafkaProfileView[];
  job?: KafkaJobProgress;
  onOpenChange: (open: boolean) => void;
  onReplay: (request: KafkaReplayRequest) => void;
  onStop: (jobId: string) => void;
}

export function ReplayDialog({ open, messages, sourceProfile, profiles, job, onOpenChange, onReplay, onStop }: Props) {
  const [targetProfileId, setTargetProfileId] = useState(sourceProfile.id);
  const [targetTopic, setTargetTopic] = useState('');
  const [partitionMode, setPartitionMode] = useState<KafkaReplayPartitionMode>('auto');
  const [explicitPartition, setExplicitPartition] = useState('');
  const [keepTimestamps, setKeepTimestamps] = useState(false);
  const [ratePerSecond, setRatePerSecond] = useState('');
  const [dryRun, setDryRun] = useState(false);
  const [acknowledgedSameTopic, setAcknowledgedSameTopic] = useState(false);

  const targetProfile = targetProfileId === sourceProfile.id ? sourceProfile : (profiles.find((profile) => profile.id === targetProfileId) ?? sourceProfile);
  const plan = useMemo(
    () => buildPlan(messages, sourceProfile, targetProfile, targetTopic, partitionMode, parseWholeNumber(explicitPartition), keepTimestamps),
    [messages, sourceProfile, targetProfile, targetTopic, partitionMode, explicitPartition, keepTimestamps],
  );
  const running = job?.kind === 'replay' && job.state === 'running';
  const canReplay = !plan.blockedReason && !running && (!plan.sameTopic || acknowledgedSameTopic);
  const profileOptions = profiles.map((profile) => ({ value: profile.id, label: profile.name }));

  const replay = () =>
    onReplay({
      jobId: generateId(),
      sourceProfile: { id: sourceProfile.id, brokers: sourceProfile.brokers },
      targetProfile,
      targetTopic,
      messages,
      partitionMode,
      explicitPartition: parseWholeNumber(explicitPartition),
      keepTimestamps,
      ratePerSecond: Number(ratePerSecond) > 0 ? Number(ratePerSecond) : 0,
      compression: 'none',
      acks: 'all',
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Replay messages</DialogTitle>
          <DialogDescription>Publish {messages.length} selected message(s) to a topic, preserving key, headers and value in their original order.</DialogDescription>
        </DialogHeader>
        <div className="kafka-replay-form">
          {profiles.length > 1 && (
            <FormField label="Target connection">
              {() => <OptionSelect value={targetProfileId} options={profileOptions} onValueChange={setTargetProfileId} ariaLabel="Target connection" />}
            </FormField>
          )}
          <FormField label="Target topic">{(id) => <Input id={id} value={targetTopic} onChange={(event) => setTargetTopic(event.target.value)} />}</FormField>
          <FormField label="Partition">
            {() => <OptionSelect value={partitionMode} options={PARTITION_MODE_OPTIONS} onValueChange={setPartitionMode} ariaLabel="Partition mode" />}
          </FormField>
          {partitionMode === 'explicit' && (
            <FormField label="Target partition">
              {(id) => <Input id={id} inputMode="numeric" value={explicitPartition} onChange={(event) => setExplicitPartition(event.target.value)} />}
            </FormField>
          )}
          <FormField label="Rate limit (messages/s, empty = unlimited)">
            {(id) => <Input id={id} inputMode="decimal" value={ratePerSecond} onChange={(event) => setRatePerSecond(event.target.value)} />}
          </FormField>
          <LabeledSwitch label="Keep original timestamps" checked={keepTimestamps} onCheckedChange={setKeepTimestamps} />
          <PlanSummary plan={plan} targetName={targetProfile.name} targetTopic={targetTopic} dryRun={dryRun} />
          {plan.sameTopic && (
            <LabeledSwitch label="I understand this replays into the topic the messages came from" checked={acknowledgedSameTopic} onCheckedChange={setAcknowledgedSameTopic} />
          )}
          {job?.kind === 'replay' && <JobProgressPanel progress={job} onStop={onStop} />}
          <div className="kafka-actions">
            <Button variant="secondary" onClick={() => setDryRun(!dryRun)}>
              Dry run
            </Button>
            <Button disabled={!canReplay} onClick={replay}>
              <Icon icon={RefreshIcon} /> Replay {plan.count} message(s)
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function buildPlan(
  messages: KafkaMessage[],
  sourceProfile: KafkaProfileDraft,
  targetProfile: KafkaProfileDraft | KafkaProfileView,
  targetTopic: string,
  partitionMode: KafkaReplayPartitionMode,
  explicitPartition: number | null,
  keepTimestamps: boolean,
): ReplayPlan {
  return planReplay({ messages, sourceProfile, targetProfile, targetTopic, partitionMode, explicitPartition, keepTimestamps, compression: 'none', acks: 'all' });
}

interface SummaryProps {
  plan: ReplayPlan;
  targetName: string;
  targetTopic: string;
  dryRun: boolean;
}

function PlanSummary({ plan, targetName, targetTopic, dryRun }: SummaryProps) {
  return (
    <div className="kafka-replay-summary">
      <p>
        {plan.count} message(s) from {plan.sourceTopics.join(', ') || 'no topic'} → <strong>{targetTopic.trim() || '…'}</strong> on <strong>{targetName}</strong>
        {plan.skipped > 0 && ` (${plan.skipped} skipped: not Kafka records)`}
      </p>
      {plan.sameTopic && <p className="kafka-replay-warning">The target is the SAME topic on the same cluster these messages came from. This will duplicate them.</p>}
      {plan.blockedReason && <p className="kafka-error">{plan.blockedReason}</p>}
      {dryRun && (
        <ol aria-label="Dry run preview">
          {plan.records.slice(0, DRY_RUN_PREVIEW_LIMIT).map((record) => (
            <li key={record.sourceId}>
              {record.topic}
              {record.partition !== undefined && ` · p${record.partition}`}
              {record.key !== null && ` · key ${record.key}`}
              {record.value === null && ' · tombstone'}
            </li>
          ))}
          {plan.count > DRY_RUN_PREVIEW_LIMIT && <li>… and {plan.count - DRY_RUN_PREVIEW_LIMIT} more</li>}
        </ol>
      )}
    </div>
  );
}
