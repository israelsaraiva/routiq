interface Props {
  dirty: boolean;
  saving: boolean;
  saved: boolean;
}

export function SaveStatus({ dirty, saving, saved }: Props) {
  if (saving) {
    return <span className="save-status" role="status"> Saving…</span>;
  }
  if (dirty) {
    return <span className="dirty" title="Unsaved changes"> *</span>;
  }
  return saved ? <span className="save-status" role="status"> Saved</span> : null;
}
