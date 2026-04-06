import Dexie, { type EntityTable } from 'dexie';
import type { ChatMessage, Contact } from '../types';

const db = new Dexie('e2ee-chat') as Dexie & {
  messages: EntityTable<ChatMessage, 'id'>;
  contacts: EntityTable<Contact, 'address'>;
};

db.version(2).stores({
  messages: 'id, conversationId, timestamp, senderAddress',
  contacts: 'address, addedAt',
});

export { db };
