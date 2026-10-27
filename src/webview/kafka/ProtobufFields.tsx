import { useEffect } from 'react';
import { KafkaHostMessage, KafkaProfileDraft } from '../../shared/types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { postKafkaMessage } from '../vscodeApi';
import { FormField } from './FormField';

interface Props {
  draft: KafkaProfileDraft;
  onChange: (changes: Partial<KafkaProfileDraft>) => void;
}

export function ProtobufFields({ draft, onChange }: Props) {
  useEffect(() => {
    const onMessage = ({ data }: MessageEvent<KafkaHostMessage>) => data?.type === 'kafkaProtoFilePicked' && onChange({ protobufFile: data.path });
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onChange]);

  return (
    <>
      <FormField label="Protobuf .proto file (optional)">
        {(id) => (
          <div className="kafka-inline-field">
            <Input id={id} value={draft.protobufFile ?? ''} placeholder="/path/to/messages.proto" onChange={(event) => onChange({ protobufFile: event.target.value })} />
            <Button variant="secondary" size="sm" onClick={() => postKafkaMessage({ type: 'kafkaPickProtoFile' })}>
              Browse…
            </Button>
          </div>
        )}
      </FormField>
      <FormField label="Protobuf message type">
        {(id) => <Input id={id} value={draft.protobufMessageType ?? ''} placeholder="pkg.OrderCreated" onChange={(event) => onChange({ protobufMessageType: event.target.value })} />}
      </FormField>
      <FormField label="Protobuf type per topic (topic=pkg.Type)">
        {(id) => (
          <Textarea id={id} rows={2} value={draft.protobufTopicTypes ?? ''} placeholder="orders=pkg.Order" onChange={(event) => onChange({ protobufTopicTypes: event.target.value })} />
        )}
      </FormField>
    </>
  );
}
