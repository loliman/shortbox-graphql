import { buildConnectionFromNodes, decodeCursorId, encodeCursorId } from '../../src/core/cursor';

describe('cursor core', () => {
  it('encodes and decodes global cursor ids', () => {
    const cursor = encodeCursorId(42);
    expect(decodeCursorId(cursor)).toBe(42);
  });

  it('decodes legacy base64 cursor ids', () => {
    const legacyCursor = Buffer.from('17').toString('base64');
    expect(decodeCursorId(legacyCursor)).toBe(17);
  });

  it('returns undefined for invalid cursors', () => {
    expect(decodeCursorId('not-a-cursor')).toBeUndefined();
    expect(decodeCursorId(undefined)).toBeUndefined();
  });

  it('builds relay-style connections with overflow detection', () => {
    const result = buildConnectionFromNodes(
      [
        { id: 1, label: 'A' },
        { id: 2, label: 'B' },
        { id: 3, label: 'C' },
      ],
      2,
      encodeCursorId(1),
    );

    expect(result.edges).toHaveLength(2);
    expect(result.edges[0].node.label).toBe('A');
    expect(result.pageInfo.hasNextPage).toBe(true);
    expect(result.pageInfo.hasPreviousPage).toBe(true);
    expect(result.pageInfo.startCursor).toBeTruthy();
    expect(result.pageInfo.endCursor).toBeTruthy();
  });
});
