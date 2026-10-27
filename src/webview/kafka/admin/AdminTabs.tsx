import { addTopicToList } from '../../../core/kafka/admin';
import { KafkaProfileDraft } from '../../../shared/types';
import { TabsContent, TabsTrigger } from '../../components/ui/tabs';
import { ClusterPanel } from './ClusterPanel';
import { GroupsPanel } from './GroupsPanel';
import { TopicsPanel } from './TopicsPanel';
import { KafkaAdminApi } from './useKafkaAdmin';

interface Props {
  admin: KafkaAdminApi;
  draft: KafkaProfileDraft;
  onDraftChange: (draft: KafkaProfileDraft) => void;
  onShowMessages: () => void;
}

export function AdminTabTriggers() {
  return (
    <>
      <TabsTrigger value="topics">Topics</TabsTrigger>
      <TabsTrigger value="groups">Consumer groups</TabsTrigger>
      <TabsTrigger value="cluster">Cluster</TabsTrigger>
    </>
  );
}

export function AdminTabContents({ admin, draft, onDraftChange, onShowMessages }: Props) {
  const addToListener = (topic: string) => onDraftChange({ ...draft, topics: addTopicToList(draft.topics, topic) });
  const consume = (topic: string) => {
    onDraftChange({ ...draft, topics: topic });
    onShowMessages();
  };

  return (
    <>
      <TabsContent value="topics">
        <TopicsPanel admin={admin} onAddToListener={addToListener} onConsume={consume} />
      </TabsContent>
      <TabsContent value="groups">
        <GroupsPanel admin={admin} />
      </TabsContent>
      <TabsContent value="cluster">
        <ClusterPanel admin={admin} />
      </TabsContent>
    </>
  );
}
