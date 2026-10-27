import { KafkaAdminArea, KafkaAdminState } from './useKafkaAdmin';

interface Props {
  state: KafkaAdminState;
  area: KafkaAdminArea;
}

export function AdminMessages({ state, area }: Props) {
  const error = state.errors[area];
  const notice = state.notices[area];
  return (
    <>
      {error && (
        <p className="kafka-error-box" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="kafka-success" role="status">
          {notice}
        </p>
      )}
    </>
  );
}
