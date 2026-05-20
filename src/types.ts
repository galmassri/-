export enum VoucherStatus {
  NEW = 'new',
  SOLD = 'sold',
  USED = 'used',
}

export interface Voucher {
  id?: string;
  code: string;
  profile: string;
  status: VoucherStatus;
  price: number;
  resellerId?: string;
  routerId?: string;
  createdAt: any;
  soldAt?: any;
  usedAt?: any;
}

export interface Profile {
  id?: string;
  name: string;
  rateLimit: string;
  sessionTimeout: string;
  validity?: string;
  price: number;
}

export interface Reseller {
  id?: string;
  name: string;
  phone: string;
  balance: number;
}

export interface RouterConfig {
  id?: string;
  name: string;
  host: string;
  user: string;
  password: string;
  port?: number;
}

export interface HotspotActiveUser {
  user: string;
  address: string;
  macAddress: string;
  uptime: string;
  bytesIn: string;
  bytesOut: string;
}
