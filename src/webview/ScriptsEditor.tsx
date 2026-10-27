import { RequestModel, RequestScripts } from '../shared/types';
import { Label } from './components/ui/label';
import { Textarea } from './components/ui/textarea';

interface Props {
  request: RequestModel;
  onChange: (patch: Partial<RequestModel>) => void;
}

const EMPTY_SCRIPTS: RequestScripts = { pre: '', post: '' };

interface ScriptFieldProps {
  label: string;
  hint: string;
  value: string;
  onValueChange: (value: string) => void;
}

function ScriptField({ label, hint, value, onValueChange }: ScriptFieldProps) {
  return (
    <Label className="script-field">
      <span className="script-label">{label}</span>
      <span className="script-hint">{hint}</span>
      <Textarea
        className="script-input"
        spellCheck={false}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
    </Label>
  );
}

export function ScriptsEditor({ request, onChange }: Props) {
  const scripts = request.scripts ?? EMPTY_SCRIPTS;
  const update = (patch: Partial<RequestScripts>) => onChange({ scripts: { ...scripts, ...patch } });
  return (
    <div className="scripts-editor">
      <ScriptField
        label="Pre-request script"
        hint="rq.variables.get/set, rq.request.url/method/headers/body, console.log"
        value={scripts.pre}
        onValueChange={(pre) => update({ pre })}
      />
      <ScriptField
        label="Post-response script"
        hint="rq.response.status/headers/body/json(), rq.test(name, fn), rq.expect(value).toBe(…)"
        value={scripts.post}
        onValueChange={(post) => update({ post })}
      />
    </div>
  );
}
