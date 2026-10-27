import { useEffect, useState } from 'react';
import { createKafkaProfile } from '../../core/kafka/profiles';
import { buildSendJobRequest, readOnlyReason } from '../../core/kafka/sendJob';
import { templateFromDraft } from '../../core/kafka/sendTemplates';
import { generateId } from '../../core/ids';
import { KafkaMessage, KafkaProfileDraft } from '../../shared/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { postKafkaMessage } from '../vscodeApi';
import { AdminTabContents, AdminTabTriggers } from './admin/AdminTabs';
import { useKafkaAdmin } from './admin/useKafkaAdmin';
import { ConnectionForm } from './ConnectionForm';
import { LogFilePanel } from './LogFilePanel';
import { MessagesPanel } from './MessagesPanel';
import { EMPTY_SEND_DRAFT, SendDraft, SendForm } from './SendForm';
import { useKafkaHost } from './useKafkaHost';

const DEFAULT_PROFILE_NAME = 'New Connection';

export function KafkaView() {
  const host = useKafkaHost();
  const [draft, setDraft] = useState<KafkaProfileDraft>(() => createKafkaProfile(DEFAULT_PROFILE_NAME));
  const [sendDraft, setSendDraft] = useState<SendDraft>(EMPTY_SEND_DRAFT);
  const [tab, setTab] = useState('messages');
  const admin = useKafkaAdmin(draft);
  const [sendPending, setSendPending] = useState(false);
  const activeProfile = host.profiles.find((profile) => profile.id === host.activeProfileId);

  useEffect(() => {
    activeProfile && setDraft(activeProfile);
  }, [activeProfile]);

  useEffect(() => setSendPending(false), [host.produceResult]);

  const send = (current: SendDraft, headers: Record<string, string>) => {
    setSendPending(true);
    postKafkaMessage({
      type: 'kafkaProduce',
      request: { requestId: generateId(), profile: draft, topic: current.topic, key: current.key || null, value: current.value, headers },
    });
  };

  const sendJob = (current: SendDraft, headers: Record<string, string>) =>
    postKafkaMessage({ type: 'kafkaSend', request: buildSendJobRequest(generateId(), draft, current, headers) });

  const saveTemplate = (name: string) => postKafkaMessage({ type: 'kafkaSaveTemplate', template: templateFromDraft(generateId(), name, sendDraft) });

  const useForSend = (message: KafkaMessage) => {
    setSendDraft({
      ...EMPTY_SEND_DRAFT,
      topic: message.topic,
      key: message.key ?? '',
      headers: message.headers ? JSON.stringify(message.headers, null, 2) : '',
      value: message.value,
    });
    setTab('send');
  };

  return (
    <div className="kafka-view">
      <aside className="kafka-sidebar">
        <ConnectionForm
          draft={draft}
          profiles={host.profiles}
          collections={host.collections}
          status={host.status}
          hasStoredPassword={activeProfile?.hasSaslPassword ?? false}
          onChange={setDraft}
          onSelectProfile={(profileId) => postKafkaMessage({ type: 'kafkaSelectProfile', profileId })}
          onSave={() => postKafkaMessage({ type: 'kafkaSaveProfile', profile: draft })}
          onDelete={() => postKafkaMessage({ type: 'kafkaDeleteProfile', profileId: draft.id })}
          onConnect={() => postKafkaMessage({ type: 'kafkaConnect', profile: draft })}
          onDisconnect={() => postKafkaMessage({ type: 'kafkaDisconnect' })}
        />
      </aside>
      <Tabs className="kafka-main" value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="send">Send</TabsTrigger>
          <TabsTrigger value="log">Log file</TabsTrigger>
          <AdminTabTriggers />
        </TabsList>
        <TabsContent value="messages">
          <MessagesPanel
            messages={host.messages}
            ui={host.ui}
            decodedValues={host.decodedValues}
            connected={host.status.state === 'connected'}
            produce={{ profile: draft, profiles: host.profiles, job: host.jobProgress }}
            onUseForSend={useForSend}
            onResend={(message) => send({ ...EMPTY_SEND_DRAFT, topic: message.topic, key: message.key ?? '', value: message.value }, message.headers ?? {})}
          />
        </TabsContent>
        <TabsContent value="send">
          <SendForm
            draft={sendDraft}
            result={host.produceResult}
            pending={sendPending}
            job={host.jobProgress?.kind === 'send' ? host.jobProgress : undefined}
            templates={host.templates}
            readOnlyReason={readOnlyReason(draft)}
            onChange={setSendDraft}
            onSend={sendJob}
            onStop={(jobId) => postKafkaMessage({ type: 'kafkaStopJob', jobId })}
            onSaveTemplate={saveTemplate}
            onDeleteTemplate={(templateId) => postKafkaMessage({ type: 'kafkaDeleteTemplate', templateId })}
          />
        </TabsContent>
        <TabsContent value="log">
          <LogFilePanel logFile={host.logFile} />
        </TabsContent>
        <AdminTabContents admin={admin} draft={draft} onDraftChange={setDraft} onShowMessages={() => setTab('messages')} />
      </Tabs>
    </div>
  );
}
