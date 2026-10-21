import { MongoClient } from 'mongodb';

export function openProfileCopyClient(uri: string | undefined) {
  if (!uri) throw new Error('Private MongoDB configuration is required.');
  return new MongoClient(uri, { serverSelectionTimeoutMS: 8000, connectTimeoutMS: 5000 });
}
