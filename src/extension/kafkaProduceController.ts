import { KafkaConnectionConfig } from '../core/kafka/connection';
import { describeReplayTarget, planReplay } from '../core/kafka/replayPlan';
import { readOnlyReason, validateSendJob } from '../core/kafka/sendJob';
import { serializeMessages } from '../core/kafka/messageExport';
import { substituteVariables } from '../core/variables';
import {
  KafkaExportFormat,
  KafkaJobProgress,
  KafkaReplayRequest,
  KafkaSendJobRequest,
  KafkaSendTemplate,
} from '../shared/kafkaProduceTypes';
import { KafkaHostMessage, KafkaMessage, KafkaProfile, KafkaProfileDraft } from '../shared/types';
import { KafkaProducerJobs } from './kafkaProducerJobs';

export interface ResolvedConnection {
  config: KafkaConnectionConfig;
  variables: Record<string, string>;
  error?: string;
}

export interface ConfirmPrompt {
  message: string;
  detail: string;
  action: string;
}

export interface ProduceEnvironment {
  resolveConnection(draft: KafkaProfileDraft): Promise<ResolvedConnection>;
  storedProfile(profileId: string): KafkaProfile | undefined;
  post(message: KafkaHostMessage): void;
  confirm(prompt: ConfirmPrompt): Promise<boolean>;
  saveExport(format: KafkaExportFormat, suggestedName: string, content: string): Promise<void>;
  templates: {
    list(): KafkaSendTemplate[];
    save(template: KafkaSendTemplate): Promise<KafkaSendTemplate[]>;
    remove(templateId: string): Promise<KafkaSendTemplate[]>;
  };
}

function failedProgress(jobId: string, kind: KafkaJobProgress['kind'], topic: string, detail: string, state: KafkaJobProgress['state'] = 'failed'): KafkaJobProgress {
  return { jobId, kind, state, topic, sent: 0, failed: 0, total: 0, run: 1, runs: 1, partitionCounts: {}, errors: [], recent: [], detail };
}

export class KafkaProduceController {
  constructor(
    private readonly environment: ProduceEnvironment,
    private readonly jobs: KafkaProducerJobs,
  ) {}

  postTemplates(): void {
    this.environment.post({ type: 'kafkaTemplates', templates: this.environment.templates.list() });
  }

  async saveTemplate(template: KafkaSendTemplate): Promise<void> {
    this.environment.post({ type: 'kafkaTemplates', templates: await this.environment.templates.save(template) });
  }

  async deleteTemplate(templateId: string): Promise<void> {
    this.environment.post({ type: 'kafkaTemplates', templates: await this.environment.templates.remove(templateId) });
  }

  stop(jobId: string): void {
    this.jobs.stop(jobId);
  }

  stopAll(): void {
    this.jobs.stopAll();
  }

  readOnlyViolation(draft: KafkaProfileDraft): string | undefined {
    return readOnlyReason(this.environment.storedProfile(draft.id)) ?? readOnlyReason(draft);
  }

  async exportMessages(format: KafkaExportFormat, suggestedName: string, messages: KafkaMessage[]): Promise<void> {
    await this.environment.saveExport(format, suggestedName, serializeMessages(messages, format));
  }

  async send(request: KafkaSendJobRequest): Promise<void> {
    const { jobId, topic } = request;
    const rejection = this.readOnlyViolation(request.profile) ?? validateSendJob(request);
    if (rejection) {
      return this.reportFailure(jobId, 'send', topic, rejection);
    }
    const { config, variables, error } = await this.environment.resolveConnection(request.profile);
    const resolvedTopic = substituteVariables(topic, variables).trim();
    const invalid = error ?? (config.brokers.length === 0 ? 'Please provide a broker endpoint' : undefined);
    if (invalid) {
      return this.reportFailure(jobId, 'send', resolvedTopic, invalid);
    }
    await this.jobs.runSend(config, { ...request, topic: resolvedTopic }, variables, (progress) => this.environment.post({ type: 'kafkaJobProgress', progress }));
  }

  async replay(request: KafkaReplayRequest): Promise<void> {
    const { jobId, targetProfile } = request;
    const { config, variables, error } = await this.environment.resolveConnection(targetProfile);
    const topic = substituteVariables(request.targetTopic, variables).trim();
    const readOnlyViolation = this.readOnlyViolation(targetProfile);
    const plan = planReplay({ ...request, targetTopic: topic, targetProfile: { ...targetProfile, readOnly: readOnlyViolation !== undefined } });
    const blocked = readOnlyViolation ?? error ?? plan.blockedReason;
    if (blocked) {
      return this.reportFailure(jobId, 'replay', topic, blocked);
    }
    if (!(await this.confirmReplay(targetProfile.name, config.brokers.join(','), topic, plan.count, plan.sameTopic))) {
      return this.reportFailure(jobId, 'replay', topic, 'Replay cancelled', 'stopped');
    }
    await this.jobs.runReplay(config, { ...request, targetTopic: topic }, plan.records, (progress) => this.environment.post({ type: 'kafkaJobProgress', progress }));
  }

  private async confirmReplay(clusterName: string, brokers: string, topic: string, count: number, sameTopic: boolean): Promise<boolean> {
    const detail = `Cluster: ${clusterName} (${brokers})\nTopic: ${topic}\nMessages: ${count}`;
    const confirmed = await this.environment.confirm({ message: describeReplayTarget(clusterName, brokers, topic, count), detail, action: 'Replay' });
    return confirmed && (!sameTopic || (await this.confirmSameTopic(topic, count, detail)));
  }

  private confirmSameTopic(topic: string, count: number, detail: string): Promise<boolean> {
    return this.environment.confirm({
      message: `The target topic "${topic}" is the SAME topic these messages came from, on the same cluster.`,
      detail: `${detail}\n\nReplaying will append ${count} duplicate message(s) to a topic that is being consumed. Are you absolutely sure?`,
      action: 'Replay to the same topic',
    });
  }

  private reportFailure(jobId: string, kind: KafkaJobProgress['kind'], topic: string, detail: string, state: KafkaJobProgress['state'] = 'failed'): void {
    this.environment.post({ type: 'kafkaJobProgress', progress: failedProgress(jobId, kind, topic, detail, state) });
  }
}
