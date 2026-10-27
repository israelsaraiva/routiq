import { ApiKeyLocation, Auth, AwsV4Auth, OAuth2Auth, OAuth2Grant, RequestModel } from '../shared/types';
import { AutocompleteInput } from './AutocompleteInput';
import { BodyEditor } from './BodyEditor';
import { LabeledSwitch } from './components/LabeledSwitch';
import { OptionSelect, toSelectOptions } from './components/OptionSelect';
import { Alert, AlertDescription } from './components/ui/alert';
import { Button } from './components/ui/button';
import { KeyValueTable } from './KeyValueTable';
import { ScriptsEditor } from './ScriptsEditor';

export type RequestTab = 'params' | 'headers' | 'body' | 'auth' | 'scripts';

export const REQUEST_TABS: Array<{ id: RequestTab; label: string }> = [
  { id: 'params', label: 'Params' },
  { id: 'headers', label: 'Headers' },
  { id: 'body', label: 'Body' },
  { id: 'auth', label: 'Auth' },
  { id: 'scripts', label: 'Scripts' },
];

interface Props {
  tab: RequestTab;
  request: RequestModel;
  onChange: (patch: Partial<RequestModel>) => void;
  oauthStatus?: OAuthStatus;
  onFetchOAuthToken?: () => void;
}

export interface OAuthStatus {
  ok: boolean;
  message: string;
}

const AUTH_TYPES: Array<{ id: Auth['type']; label: string }> = [
  { id: 'none', label: 'None' },
  { id: 'bearer', label: 'Bearer Token' },
  { id: 'basic', label: 'Basic Auth' },
  { id: 'apikey', label: 'API Key' },
  { id: 'oauth2', label: 'OAuth 2.0' },
  { id: 'digest', label: 'Digest Auth' },
  { id: 'awsv4', label: 'AWS Signature' },
];

const OAUTH_GRANTS: Array<{ id: OAuth2Grant; label: string }> = [
  { id: 'authorization_code', label: 'Authorization Code' },
  { id: 'client_credentials', label: 'Client Credentials' },
  { id: 'password', label: 'Password' },
];

const API_KEY_LOCATIONS: Array<{ id: ApiKeyLocation; label: string }> = [
  { id: 'header', label: 'Header' },
  { id: 'query', label: 'Query param' },
];

function emptyAuth(type: Auth['type']): Auth {
  if (type === 'bearer') {
    return { type, token: '' };
  }
  if (type === 'basic' || type === 'digest') {
    return { type, username: '', password: '' };
  }
  if (type === 'apikey') {
    return { type, key: '', value: '', location: 'header' };
  }
  if (type === 'awsv4') {
    return { type, accessKey: '', secretKey: '', sessionToken: '', region: '', service: '' };
  }
  if (type === 'oauth2') {
    return { type, grant: 'client_credentials', tokenUrl: '', clientId: '', clientSecret: '', scope: '', username: '', password: '' };
  }
  return { type: 'none' };
}

interface AuthFieldProps {
  placeholder: string;
  value: string;
  onValueChange: (value: string) => void;
  secret?: boolean;
}

function AuthField({ placeholder, value, onValueChange, secret }: AuthFieldProps) {
  return (
    <AutocompleteInput
      className="auth-field"
      masked={secret}
      placeholder={placeholder}
      ariaLabel={placeholder}
      value={value}
      onChange={onValueChange}
    />
  );
}

function CredentialFields({ auth, onChange }: { auth: Extract<Auth, { username: string; password: string }>; onChange: (auth: Auth) => void }) {
  return (
    <>
      <AuthField placeholder="Username" value={auth.username} onValueChange={(username) => onChange({ ...auth, username })} />
      <AuthField secret placeholder="Password" value={auth.password} onValueChange={(password) => onChange({ ...auth, password })} />
    </>
  );
}

function ApiKeyFields({ auth, onChange }: { auth: Extract<Auth, { type: 'apikey' }>; onChange: (auth: Auth) => void }) {
  return (
    <>
      <AuthField placeholder="Key name" value={auth.key} onValueChange={(key) => onChange({ ...auth, key })} />
      <AuthField placeholder="Value" value={auth.value} onValueChange={(value) => onChange({ ...auth, value })} />
      <OptionSelect
        className="auth-field"
        ariaLabel="API key location"
        value={auth.location}
        options={toSelectOptions(API_KEY_LOCATIONS)}
        onValueChange={(location) => onChange({ ...auth, location })}
      />
    </>
  );
}

function AwsV4Fields({ auth, onChange }: { auth: AwsV4Auth; onChange: (auth: Auth) => void }) {
  return (
    <>
      <AuthField placeholder="Access key" value={auth.accessKey} onValueChange={(accessKey) => onChange({ ...auth, accessKey })} />
      <AuthField secret placeholder="Secret key" value={auth.secretKey} onValueChange={(secretKey) => onChange({ ...auth, secretKey })} />
      <AuthField secret placeholder="Session token (optional)" value={auth.sessionToken} onValueChange={(sessionToken) => onChange({ ...auth, sessionToken })} />
      <AuthField placeholder="Region (e.g. eu-west-1)" value={auth.region} onValueChange={(region) => onChange({ ...auth, region })} />
      <AuthField placeholder="Service (e.g. execute-api)" value={auth.service} onValueChange={(service) => onChange({ ...auth, service })} />
    </>
  );
}

function AuthorizationCodeFields({ auth, onChange }: { auth: OAuth2Auth; onChange: (auth: Auth) => void }) {
  return (
    <>
      <AuthField placeholder="Authorization URL" value={auth.authUrl ?? ''} onValueChange={(authUrl) => onChange({ ...auth, authUrl })} />
      <AuthField
        placeholder="Redirect URL (optional, http://localhost:PORT/path)"
        value={auth.redirectUrl ?? ''}
        onValueChange={(redirectUrl) => onChange({ ...auth, redirectUrl })}
      />
      <LabeledSwitch label="Use PKCE (S256)" checked={auth.usePkce ?? false} onCheckedChange={(usePkce) => onChange({ ...auth, usePkce })} />
    </>
  );
}

interface OAuthFieldsProps {
  auth: OAuth2Auth;
  onChange: (auth: Auth) => void;
  status?: OAuthStatus;
  onFetchToken?: () => void;
}

function OAuthFields({ auth, onChange, status, onFetchToken }: OAuthFieldsProps) {
  return (
    <>
      <OptionSelect
        className="auth-field"
        ariaLabel="OAuth grant type"
        value={auth.grant}
        options={toSelectOptions(OAUTH_GRANTS)}
        onValueChange={(grant) => onChange({ ...auth, grant })}
      />
      {auth.grant === 'authorization_code' && <AuthorizationCodeFields auth={auth} onChange={onChange} />}
      <AuthField placeholder="Token URL" value={auth.tokenUrl} onValueChange={(tokenUrl) => onChange({ ...auth, tokenUrl })} />
      <AuthField placeholder="Client ID" value={auth.clientId} onValueChange={(clientId) => onChange({ ...auth, clientId })} />
      <AuthField secret placeholder="Client secret" value={auth.clientSecret} onValueChange={(clientSecret) => onChange({ ...auth, clientSecret })} />
      <AuthField placeholder="Scope" value={auth.scope} onValueChange={(scope) => onChange({ ...auth, scope })} />
      {auth.grant === 'password' && <CredentialFields auth={auth} onChange={onChange} />}
      <Button className="auth-field" onClick={onFetchToken}>
        Fetch token
      </Button>
      {status && (
        <Alert className="auth-status" variant={status.ok ? 'success' : 'destructive'}>
          <AlertDescription>{status.message}</AlertDescription>
        </Alert>
      )}
    </>
  );
}

function AuthEditor({ request, onChange, oauthStatus, onFetchOAuthToken }: Omit<Props, 'tab'>) {
  const { auth } = request;
  const changeAuth = (next: Auth) => onChange({ auth: next });
  return (
    <div>
      <OptionSelect
        ariaLabel="Auth type"
        value={auth.type}
        options={toSelectOptions(AUTH_TYPES)}
        onValueChange={(type) => changeAuth(emptyAuth(type))}
      />
      {auth.type === 'bearer' && (
        <AuthField placeholder="Token" value={auth.token} onValueChange={(token) => changeAuth({ ...auth, token })} />
      )}
      {(auth.type === 'basic' || auth.type === 'digest') && <CredentialFields auth={auth} onChange={changeAuth} />}
      {auth.type === 'apikey' && <ApiKeyFields auth={auth} onChange={changeAuth} />}
      {auth.type === 'awsv4' && <AwsV4Fields auth={auth} onChange={changeAuth} />}
      {auth.type === 'oauth2' && (
        <OAuthFields auth={auth} onChange={changeAuth} status={oauthStatus} onFetchToken={onFetchOAuthToken} />
      )}
    </div>
  );
}

export function RequestTabContent({ tab, request, onChange, oauthStatus, onFetchOAuthToken }: Props) {
  if (tab === 'params') {
    return <KeyValueTable rows={request.params} onChange={(params) => onChange({ params })} keyPlaceholder="Parameter" />;
  }
  if (tab === 'headers') {
    return <KeyValueTable rows={request.headers} onChange={(headers) => onChange({ headers })} keyPlaceholder="Header" suggestHeaderNames />;
  }
  if (tab === 'scripts') {
    return <ScriptsEditor request={request} onChange={onChange} />;
  }
  return tab === 'body' ? <BodyEditor body={request.body} onChange={(body) => onChange({ body })} /> : (
    <AuthEditor request={request} onChange={onChange} oauthStatus={oauthStatus} onFetchOAuthToken={onFetchOAuthToken} />
  );
}
