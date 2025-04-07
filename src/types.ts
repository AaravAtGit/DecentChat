export interface GunAck {
  err?: string;
  ok?: number;
  sea?: unknown;
}

export interface GunData {
  initialized?: boolean;
  name?: string;
  text?: string;
  type?: 'text' | 'media';
  content?: string;
  sender?: string;
  timestamp?: number;
  displayName?: string;
  profilePicture?: string;
  online?: boolean;
  lastSeen?: number;
  username?: string;
  createdBy?: string;
  lastUpdated?: number;
  channel?: string;
}

export interface IGunInstance<T = GunData> {
  get: (key: string) => IGunInstance<T>;
  put: (data: Partial<T>, cb?: (ack: GunAck) => void) => IGunInstance<T>;
  on: (cb: (data: T | null, key: string) => void) => { off: () => void };
  map: () => IGunInstance<T>;
  user: () => GunUser;
}

export interface GunUser {
  create: (username: string, password: string, cb: (ack: GunAck) => void) => void;
  auth: (usernameOrPair: string | object, password?: string, cb?: (ack: any) => void) => void;
  leave: () => void;
}
