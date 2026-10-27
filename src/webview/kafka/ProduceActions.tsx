import { Download01Icon, RefreshIcon } from '@hugeicons/core-free-icons';
import { useState } from 'react';
import { exportFileName } from '../../core/kafka/messageExport';
import { messagesExportFileName } from '../../core/kafka/flowGroups';
import { BuiltCommand, buildConsoleProducerCommand, buildKcatCommand } from '../../core/kafka/producerCommands';
import { isReplayable, sortChronologically } from '../../core/kafka/replayPlan';
import { readOnlyReason } from '../../core/kafka/sendJob';
import { KafkaExportFormat, KafkaJobProgress, KafkaReplayRequest } from '../../shared/kafkaProduceTypes';
import { KafkaMessage, KafkaProfileDraft, KafkaProfileView } from '../../shared/types';
import { Icon } from '../Icon';
import { Button } from '../components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { postKafkaMessage } from '../vscodeApi';
import { ReplayDialog } from './ReplayDialog';

const FORMAT_LABELS: Array<{ format: KafkaExportFormat; label: string }> = [
  { format: 'json', label: 'JSON' },
  { format: 'ndjson', label: 'NDJSON' },
  { format: 'csv', label: 'CSV' },
];

export interface ProduceContext {
  profile: KafkaProfileDraft;
  profiles: KafkaProfileView[];
  job?: KafkaJobProgress;
}

interface Props {
  context: ProduceContext;
  visible: KafkaMessage[];
  selected: KafkaMessage[];
}

export function exportMessages(messages: KafkaMessage[], format: KafkaExportFormat): void {
  postKafkaMessage({
    type: 'kafkaExportMessages',
    format,
    suggestedName: exportFileName(messagesExportFileName(new Date()), format),
    messages: sortChronologically(messages),
  });
}

export function ProduceActions({ context, visible, selected }: Props) {
  const [replayOpen, setReplayOpen] = useState(false);
  const [commandWarning, setCommandWarning] = useState<string>();
  const replayable = selected.filter(isReplayable);
  const blockedReason = readOnlyReason(context.profile);

  const copyCommand = (build: (message: KafkaMessage) => BuiltCommand) => {
    const { command, warning } = build(selected[0]);
    postKafkaMessage({ type: 'kafkaCopy', text: command });
    setCommandWarning(warning);
  };

  const replay = (request: KafkaReplayRequest) => postKafkaMessage({ type: 'kafkaReplay', request });

  return (
    <>
      <ExportMenu visible={visible} selected={selected} />
      {selected.length === 1 && (
        <>
          <Button variant="secondary" size="sm" onClick={() => copyCommand((message) => buildKcatCommand(message, context.profile))}>
            Copy kcat command
          </Button>
          <Button variant="secondary" size="sm" onClick={() => copyCommand((message) => buildConsoleProducerCommand(message, context.profile))}>
            Copy console-producer command
          </Button>
          {commandWarning && <span className="kafka-hint">{commandWarning}</span>}
        </>
      )}
      {replayable.length > 0 && (
        <Button variant="secondary" size="sm" disabled={Boolean(blockedReason)} title={blockedReason} onClick={() => setReplayOpen(true)}>
          <Icon icon={RefreshIcon} /> Replay selected ({replayable.length})
        </Button>
      )}
      {replayOpen && (
        <ReplayDialog
          open
          messages={replayable}
          sourceProfile={context.profile}
          profiles={context.profiles}
          job={context.job}
          onOpenChange={setReplayOpen}
          onReplay={replay}
          onStop={(jobId) => postKafkaMessage({ type: 'kafkaStopJob', jobId })}
        />
      )}
    </>
  );
}

function ExportMenu({ visible, selected }: Pick<Props, 'visible' | 'selected'>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" disabled={visible.length === 0}>
          <Icon icon={Download01Icon} /> Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {FORMAT_LABELS.map(({ format, label }) => (
          <DropdownMenuItem key={`all-${format}`} onSelect={() => exportMessages(visible, format)}>
            All ({visible.length}) as {label}
          </DropdownMenuItem>
        ))}
        {selected.length > 0 &&
          FORMAT_LABELS.map(({ format, label }) => (
            <DropdownMenuItem key={`selected-${format}`} onSelect={() => exportMessages(selected, format)}>
              Selected ({selected.length}) as {label}
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
