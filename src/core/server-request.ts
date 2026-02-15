import type { IncomingMessage } from 'http';

export type GraphQLRequestBody =
  | {
      operationName?: string;
      query?: string;
    }
  | null
  | undefined;

export const parseRequestIp = (request: IncomingMessage): string | undefined => {
  const forwarded = request.headers['x-forwarded-for'];
  const forwardedRaw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof forwardedRaw === 'string') {
    const forwardedIp = forwardedRaw.split(',')[0]?.trim();
    if (forwardedIp) return forwardedIp;
  }
  return request.socket.remoteAddress || undefined;
};
