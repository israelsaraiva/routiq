import { AUTH_PRESET_OPTIONS, applyAuthPreset, passwordLabel, usernameLabel, usesTlsClientCertificate } from '../../core/kafka/authPresets';
import { SASL_MECHANISM_OPTIONS } from '../../core/kafka/connection';
import { KafkaSecretName } from '../../shared/kafkaEngineTypes';
import { KafkaProfileDraft, KafkaProfileView } from '../../shared/types';
import { LabeledSwitch } from '../components/LabeledSwitch';
import { OptionSelect } from '../components/OptionSelect';
import { Input } from '../components/ui/input';
import { FormField } from './FormField';

const STORED_PLACEHOLDER = 'Stored in Secret Storage';

interface Props {
  draft: KafkaProfileDraft;
  storedSecrets: KafkaSecretName[];
  hasStoredPassword: boolean;
  onChange: (draft: KafkaProfileDraft) => void;
}

interface SecretInputProps {
  label: string;
  name: KafkaSecretName;
  draft: KafkaProfileDraft;
  stored: KafkaSecretName[];
  onChange: (draft: KafkaProfileDraft) => void;
}

export function storedSecretsOf(view: KafkaProfileView | undefined): KafkaSecretName[] {
  return view?.storedSecrets ?? [];
}

function SecretInput({ label, name, draft, stored, onChange }: SecretInputProps) {
  return (
    <FormField label={label}>
      {(id) => (
        <Input
          id={id}
          type="password"
          value={draft.secrets?.[name] ?? ''}
          placeholder={stored.includes(name) ? STORED_PLACEHOLDER : ''}
          onChange={(event) => onChange({ ...draft, secrets: { ...draft.secrets, [name]: event.target.value } })}
        />
      )}
    </FormField>
  );
}

function TextInput({ label, field, draft, placeholder, onChange }: { label: string; field: keyof KafkaProfileDraft; draft: KafkaProfileDraft; placeholder?: string; onChange: (draft: KafkaProfileDraft) => void }) {
  return (
    <FormField label={label}>
      {(id) => <Input id={id} value={String(draft[field] ?? '')} placeholder={placeholder} onChange={(event) => onChange({ ...draft, [field]: event.target.value })} />}
    </FormField>
  );
}

function PlainCredentials({ draft, hasStoredPassword, onChange }: Pick<Props, 'draft' | 'hasStoredPassword' | 'onChange'>) {
  return (
    <>
      <TextInput label={usernameLabel(draft.authPreset)} field="saslUsername" draft={draft} onChange={onChange} />
      <FormField label={passwordLabel(draft.authPreset)}>
        {(id) => (
          <Input
            id={id}
            type="password"
            value={draft.saslPassword ?? ''}
            placeholder={hasStoredPassword ? STORED_PLACEHOLDER : ''}
            onChange={(event) => onChange({ ...draft, saslPassword: event.target.value })}
          />
        )}
      </FormField>
    </>
  );
}

function OAuthFields({ draft, stored, onChange }: { draft: KafkaProfileDraft; stored: KafkaSecretName[]; onChange: (draft: KafkaProfileDraft) => void }) {
  return (
    <>
      <SecretInput label="Access token (or use token endpoint below)" name="oauthToken" draft={draft} stored={stored} onChange={onChange} />
      <TextInput label="Token endpoint URL" field="oauthTokenUrl" draft={draft} placeholder="https://idp.example.com/oauth/token" onChange={onChange} />
      <TextInput label="Client ID" field="oauthClientId" draft={draft} onChange={onChange} />
      <SecretInput label="Client secret" name="oauthClientSecret" draft={draft} stored={stored} onChange={onChange} />
      <TextInput label="Scope (optional)" field="oauthScope" draft={draft} onChange={onChange} />
    </>
  );
}

function MskIamFields({ draft, stored, onChange }: { draft: KafkaProfileDraft; stored: KafkaSecretName[]; onChange: (draft: KafkaProfileDraft) => void }) {
  return (
    <>
      <TextInput label="AWS region (blank = from broker host / AWS_REGION)" field="awsRegion" draft={draft} placeholder="eu-west-1" onChange={onChange} />
      <TextInput label="AWS access key ID (blank = environment)" field="awsAccessKeyId" draft={draft} onChange={onChange} />
      <SecretInput label="AWS secret access key" name="awsSecretAccessKey" draft={draft} stored={stored} onChange={onChange} />
      <SecretInput label="AWS session token (optional)" name="awsSessionToken" draft={draft} stored={stored} onChange={onChange} />
    </>
  );
}

function TlsFields({ draft, stored, onChange }: { draft: KafkaProfileDraft; stored: KafkaSecretName[]; onChange: (draft: KafkaProfileDraft) => void }) {
  return (
    <>
      <TextInput label="CA certificate (path or PEM)" field="tlsCa" draft={draft} onChange={onChange} />
      <TextInput label="Client certificate (path or PEM)" field="tlsCert" draft={draft} onChange={onChange} />
      <TextInput label="Client key path" field="tlsKeyPath" draft={draft} onChange={onChange} />
      <SecretInput label="Client key PEM (pasted)" name="tlsKeyPem" draft={draft} stored={stored} onChange={onChange} />
      <SecretInput label="Key passphrase" name="tlsPassphrase" draft={draft} stored={stored} onChange={onChange} />
      <LabeledSwitch
        label="Verify server certificate"
        checked={draft.tlsRejectUnauthorized !== false}
        onCheckedChange={(tlsRejectUnauthorized) => onChange({ ...draft, tlsRejectUnauthorized })}
      />
    </>
  );
}

export function AuthFields({ draft, storedSecrets, hasStoredPassword, onChange }: Props) {
  const preset = draft.authPreset ?? 'custom';
  const mechanism = draft.saslMechanism;
  const usesPassword = mechanism === 'plain' || mechanism === 'scram-sha-256' || mechanism === 'scram-sha-512';

  return (
    <>
      <FormField label="Authentication preset">
        {() => <OptionSelect value={preset} options={AUTH_PRESET_OPTIONS} onValueChange={(next) => onChange(applyAuthPreset(draft, next))} ariaLabel="Authentication preset" />}
      </FormField>
      <LabeledSwitch label="SSL / TLS" checked={draft.ssl} onCheckedChange={(ssl) => onChange({ ...draft, ssl })} />
      <FormField label="SASL">
        {() => (
          <OptionSelect
            value={mechanism}
            options={SASL_MECHANISM_OPTIONS}
            onValueChange={(saslMechanism) => onChange({ ...draft, saslMechanism })}
            ariaLabel="SASL mechanism"
          />
        )}
      </FormField>
      {usesPassword && <PlainCredentials draft={draft} hasStoredPassword={hasStoredPassword} onChange={onChange} />}
      {mechanism === 'oauthbearer' && <OAuthFields draft={draft} stored={storedSecrets} onChange={onChange} />}
      {mechanism === 'aws-msk-iam' && <MskIamFields draft={draft} stored={storedSecrets} onChange={onChange} />}
      {(draft.ssl || usesTlsClientCertificate(draft)) && <TlsFields draft={draft} stored={storedSecrets} onChange={onChange} />}
    </>
  );
}
