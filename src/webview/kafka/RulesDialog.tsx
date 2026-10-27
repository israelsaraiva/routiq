import { Add01Icon, ColorsIcon, Delete02Icon } from '@hugeicons/core-free-icons';
import { useState } from 'react';
import { createRule, validateRule } from '../../core/kafka/highlightRules';
import { KafkaHighlightRule, KafkaRuleMatchType } from '../../shared/kafkaMessageTypes';
import { Icon } from '../Icon';
import { IconButton } from '../components/IconButton';
import { LabeledSwitch } from '../components/LabeledSwitch';
import { OptionSelect } from '../components/OptionSelect';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';

const MATCH_OPTIONS: Array<{ value: KafkaRuleMatchType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'regex', label: 'Regex' },
  { value: 'jsonpath', label: 'JSON path' },
];

interface Props {
  rules: KafkaHighlightRule[];
  hits: Record<string, number>;
  onChange: (rules: KafkaHighlightRule[]) => void;
}

export function RulesDialog({ rules, hits, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(rules);
  const errors = draft.map(validateRule);
  const valid = errors.every((error) => error === undefined);
  const update = (id: string, changes: Partial<KafkaHighlightRule>) => setDraft(draft.map((rule) => (rule.id === id ? { ...rule, ...changes } : rule)));

  const handleOpenChange = (next: boolean) => {
    next && setDraft(rules);
    setOpen(next);
  };

  const save = () => {
    onChange(draft);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Icon icon={ColorsIcon} /> Rules ({rules.filter((rule) => rule.enabled).length})
        </Button>
      </DialogTrigger>
      <DialogContent className="kafka-rules-dialog">
        <DialogHeader>
          <DialogTitle>Highlight rules</DialogTitle>
          <DialogDescription>Matching messages get a coloured border and badge; optionally notify (at most once every 10 seconds per rule).</DialogDescription>
        </DialogHeader>
        <div className="kafka-rules-list">
          {draft.map((rule, index) => (
            <div key={rule.id} className="kafka-rule-row">
              <div className="kafka-rule-main">
                <input type="color" aria-label={`Colour of ${rule.name}`} value={rule.color} onChange={(event) => update(rule.id, { color: event.target.value })} />
                <Input aria-label={`Rule name ${index + 1}`} value={rule.name} onChange={(event) => update(rule.id, { name: event.target.value })} />
                <OptionSelect value={rule.matchType} options={MATCH_OPTIONS} onValueChange={(matchType) => update(rule.id, { matchType })} ariaLabel={`Match type ${index + 1}`} />
                <Input
                  aria-label={`Rule pattern ${index + 1}`}
                  placeholder={rule.matchType === 'jsonpath' ? "$.status == 'FAILED'" : 'pattern'}
                  value={rule.pattern}
                  onChange={(event) => update(rule.id, { pattern: event.target.value })}
                />
                <Badge variant="outline">{hits[rule.id] ?? 0} hits</Badge>
                <IconButton icon={Delete02Icon} label={`Delete rule ${rule.name}`} compact onClick={() => setDraft(draft.filter((candidate) => candidate.id !== rule.id))} />
              </div>
              <div className="kafka-rule-options">
                <LabeledSwitch label="Enabled" checked={rule.enabled} onCheckedChange={(enabled) => update(rule.id, { enabled })} />
                <LabeledSwitch label="Badge" checked={rule.badge} onCheckedChange={(badge) => update(rule.id, { badge })} />
                <LabeledSwitch label="Notify" checked={rule.notify} onCheckedChange={(notify) => update(rule.id, { notify })} />
                {errors[index] && <span className="kafka-error">{errors[index]}</span>}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={() => setDraft([...draft, createRule()])}>
            <Icon icon={Add01Icon} /> Add rule
          </Button>
          <Button size="sm" disabled={!valid} onClick={save}>
            Save rules
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
