import { fromGlobalId, toGlobalId } from 'graphql-relay';

const CURSOR_TYPE = 'cursor';

const decodeLegacyCursor = (cursor: string): number | undefined => {
  try {
    const parsed = parseInt(Buffer.from(cursor, 'base64').toString('ascii'), 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

export const decodeCursorId = (cursor: string | undefined): number | undefined => {
  if (!cursor) return undefined;
  try {
    const globalId = fromGlobalId(cursor);
    const parsed = parseInt(globalId.id, 10);
    if (globalId.type === CURSOR_TYPE && Number.isFinite(parsed)) {
      return parsed;
    }
  } catch {
    // Compatibility path for legacy raw base64 id cursors.
  }

  return decodeLegacyCursor(cursor);
};

export const encodeCursorId = (id: number | string): string => {
  return toGlobalId(CURSOR_TYPE, String(id));
};

export const buildConnectionFromNodes = <T extends { id: number | string }>(
  nodesWithPossibleOverflow: T[],
  limit: number,
  after: string | undefined,
) => {
  const hasNextPage = nodesWithPossibleOverflow.length > limit;
  const nodes = nodesWithPossibleOverflow.slice(0, limit);
  const edges = nodes.map((node) => ({
    cursor: encodeCursorId(node.id),
    node,
  }));

  return {
    edges,
    pageInfo: {
      hasNextPage,
      hasPreviousPage: !!after,
      startCursor: edges.length > 0 ? edges[0].cursor : null,
      endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
    },
  };
};
