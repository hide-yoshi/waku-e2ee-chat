import Dexie, { type EntityTable } from 'dexie';
import type { ChatMessage, Room } from '../types';

const db = new Dexie('e2ee-chat') as Dexie & {
  messages: EntityTable<ChatMessage, 'id'>;
  rooms: EntityTable<Room, 'id'>;
};

db.version(1).stores({
  messages: 'id, roomId, timestamp, senderAddress',
  rooms: 'id, createdAt',
});

export { db };
