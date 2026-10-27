import { KafkaProfileDraft } from '../../shared/types';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { FormField } from './FormField';

interface Props {
  draft: KafkaProfileDraft;
  onChange: (changes: Partial<KafkaProfileDraft>) => void;
}

export function ProtobufFields({ draft, onChange }: Props) {
  return (
    <>
      <FormField label="Protobuf .proto file (optional)">
        {(id) => <Input id={id} value={draft.protobufFile ?? ''} placeholder="/path/to/messages.proto" onChange={(event) => onChange({ protobufFile: event.target.value })} />}
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
