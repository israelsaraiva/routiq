import { StopIcon } from '@hugeicons/core-free-icons';
import { KafkaJobProgress } from '../../shared/kafkaProduceTypes';
import { Icon } from '../Icon';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';

const STATE_VARIANT = { running: 'warning', done: 'success', stopped: 'secondary', failed: 'destructive' } as const;
const STATE_LABEL = { running: 'Running', done: 'Completed', stopped: 'Stopped', failed: 'Failed' } as const;

interface Props {
  progress: KafkaJobProgress;
  onStop: (jobId: string) => void;
}

export function formatPartitionCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .map(([partition, count]) => `p${partition}: ${count}`)
    .join(', ');
}

export function JobProgressPanel({ progress, onStop }: Props) {
  const { state, kind, sent, failed, total, run, runs, partitionCounts, errors, detail, topic } = progress;
  const verb = kind === 'replay' ? 'Replayed' : 'Sent';
  const partitions = formatPartitionCounts(partitionCounts);

  return (
    <section className="kafka-job" aria-label="Job progress">
      <div className="kafka-job-header">
        <Badge variant={STATE_VARIANT[state]}>
          {state === 'running' && <span className="kafka-running-dot" aria-hidden="true" />}
          {STATE_LABEL[state]}
        </Badge>
        <span>
          {verb} {sent} / {total} to {topic}
          {failed > 0 && ` · ${failed} failed`}
          {runs > 1 && ` · run ${run}/${runs}`}
        </span>
        {state === 'running' && (
          <Button variant="destructive" size="sm" onClick={() => onStop(progress.jobId)}>
            <Icon icon={StopIcon} /> Stop
          </Button>
        )}
      </div>
      {total > 0 && <progress className="kafka-progress" value={sent + failed} max={total} aria-label="Progress" />}
      {partitions && <p className="kafka-job-partitions">Partitions — {partitions}</p>}
      {detail && <p className={state === 'failed' ? 'kafka-error' : 'kafka-job-detail'}>{detail}</p>}
      {errors.map((error) => (
        <p className="kafka-error" key={error}>
          {error}
        </p>
      ))}
    </section>
  );
}
