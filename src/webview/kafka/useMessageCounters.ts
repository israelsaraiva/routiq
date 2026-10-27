import { useEffect, useMemo, useRef, useState } from 'react';
import { KafkaMessage } from '../../shared/types';

const ANNOUNCE_INTERVAL_MS = 2000;

export function useUnseenCount(messages: KafkaMessage[], viewing: boolean): number {
  const [seenIds, setSeenIds] = useState<Set<string>>(() => new Set(messages.map((message) => message.id)));

  useEffect(() => {
    viewing && setSeenIds(new Set(messages.map((message) => message.id)));
  }, [viewing, messages]);

  return useMemo(() => (viewing ? 0 : messages.filter((message) => !seenIds.has(message.id)).length), [viewing, messages, seenIds]);
}

export function useNewMessageAnnouncement(messages: KafkaMessage[], ready: boolean): string {
  const knownIds = useRef<Set<string> | null>(null);
  const pending = useRef(0);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (!ready) {
      return;
    }
    const known = knownIds.current;
    knownIds.current = new Set(messages.map((message) => message.id));
    known && (pending.current += messages.filter((message) => !known.has(message.id)).length);
  }, [messages, ready]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (pending.current > 0) {
        setAnnouncement(`${pending.current} new ${pending.current === 1 ? 'message' : 'messages'}`);
        pending.current = 0;
      }
    }, ANNOUNCE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return announcement;
}
