import * as vscode from 'vscode';
import { KafkaProfile, KafkaProfileDraft, KafkaProfileView } from '../shared/types';
import { createKafkaProfile, duplicateProfile, normalizeStoredProfiles, removeProfile, saslPasswordKey, stripPassword, uniqueProfileName, upsertProfile } from '../core/kafka/profiles';

const PROFILES_KEY = 'routiq.kafka.profiles';
const LAST_PROFILE_KEY = 'routiq.kafka.lastProfileId';

export class KafkaProfileStore implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;

  constructor(
    private readonly memento: vscode.Memento,
    private readonly secrets: vscode.SecretStorage,
  ) {}

  list(): KafkaProfile[] {
    return normalizeStoredProfiles(this.memento.get<unknown>(PROFILES_KEY));
  }

  get(profileId: string): KafkaProfile | undefined {
    return this.list().find((profile) => profile.id === profileId);
  }

  get lastProfileId(): string | undefined {
    const stored = this.memento.get<string>(LAST_PROFILE_KEY);
    return stored && this.get(stored) ? stored : undefined;
  }

  async rememberLast(profileId: string): Promise<void> {
    await this.memento.update(LAST_PROFILE_KEY, profileId);
  }

  async views(): Promise<KafkaProfileView[]> {
    return Promise.all(this.list().map(async (profile) => ({ ...profile, hasSaslPassword: (await this.readPassword(profile.id)) !== undefined })));
  }

  async create(baseName: string): Promise<KafkaProfile> {
    const profile = createKafkaProfile(uniqueProfileName(this.list(), baseName));
    await this.writeProfiles(upsertProfile(this.list(), profile));
    return profile;
  }

  async save(draft: KafkaProfileDraft): Promise<void> {
    await this.writePassword(draft);
    await this.writeProfiles(upsertProfile(this.list(), stripPassword(draft)));
  }

  async duplicate(profileId: string): Promise<KafkaProfile | undefined> {
    const source = this.get(profileId);
    if (!source) {
      return undefined;
    }
    const copy = duplicateProfile(this.list(), source);
    const password = await this.readPassword(source.id);
    password !== undefined && (await this.secrets.store(saslPasswordKey(copy.id), password));
    await this.writeProfiles(upsertProfile(this.list(), copy));
    return copy;
  }

  async rename(profileId: string, name: string): Promise<void> {
    const profile = this.get(profileId);
    profile && (await this.writeProfiles(upsertProfile(this.list(), { ...profile, name })));
  }

  async remove(profileId: string): Promise<void> {
    await this.secrets.delete(saslPasswordKey(profileId));
    await this.writeProfiles(removeProfile(this.list(), profileId));
  }

  readPassword(profileId: string): Thenable<string | undefined> {
    return this.secrets.get(saslPasswordKey(profileId));
  }

  dispose(): void {
    this.changed.dispose();
  }

  private async writePassword(draft: KafkaProfileDraft): Promise<void> {
    if (draft.saslPassword === undefined) {
      return;
    }
    const key = saslPasswordKey(draft.id);
    await (draft.saslPassword === '' ? this.secrets.delete(key) : this.secrets.store(key, draft.saslPassword));
  }

  private async writeProfiles(profiles: KafkaProfile[]): Promise<void> {
    await this.memento.update(PROFILES_KEY, profiles);
    this.changed.fire();
  }
}
