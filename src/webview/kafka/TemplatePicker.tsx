import { FloppyDiskIcon } from '@hugeicons/core-free-icons';
import { useState } from 'react';
import { KafkaSendTemplate } from '../../shared/kafkaProduceTypes';
import { Icon } from '../Icon';
import { ConfirmAction } from '../components/ConfirmAction';
import { OptionSelect } from '../components/OptionSelect';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

interface Props {
  templates: KafkaSendTemplate[];
  onLoad: (template: KafkaSendTemplate) => void;
  onSave: (name: string) => void;
  onDelete: (templateId: string) => void;
}

export function TemplatePicker({ templates, onLoad, onSave, onDelete }: Props) {
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const selected = templates.find((template) => template.id === selectedId);
  const options = templates.map((template) => ({ value: template.id, label: template.name }));

  const select = (templateId: string) => {
    const template = templates.find((candidate) => candidate.id === templateId);
    setSelectedId(templateId);
    template && (setName(template.name), onLoad(template));
  };

  return (
    <div className="kafka-templates">
      {templates.length > 0 && <OptionSelect value={selectedId} options={options} onValueChange={select} ariaLabel="Saved templates" placeholder="Load saved template…" />}
      <Input aria-label="Template name" placeholder="Template name" value={name} onChange={(event) => setName(event.target.value)} />
      <Button variant="secondary" size="sm" disabled={!name.trim()} onClick={() => onSave(name.trim())}>
        <Icon icon={FloppyDiskIcon} /> Save template
      </Button>
      {selected && (
        <ConfirmAction
          trigger={
            <Button variant="ghost" size="sm">
              Delete template
            </Button>
          }
          title="Delete template"
          description={`Delete the saved template "${selected.name}"?`}
          confirmLabel="Delete"
          onConfirm={() => (onDelete(selected.id), setSelectedId(''))}
        />
      )}
    </div>
  );
}
