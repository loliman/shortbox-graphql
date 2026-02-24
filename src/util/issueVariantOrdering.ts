import { naturalCompare } from './util';

type VariantSortable = {
  id?: unknown;
  format?: unknown;
  variant?: unknown;
};

const normalizeText = (value: unknown): string => String(value ?? '').trim();

const normalizeFormat = (value: unknown): string =>
  normalizeText(value).replace(/\s+/g, '').toUpperCase();

const normalizeVariant = (value: unknown): string =>
  normalizeText(value).toLocaleLowerCase('de-DE');

const regularFormatRank = (format: unknown): number => {
  const normalized = normalizeFormat(format);
  if (normalized === 'HEFT') return 0;
  if (normalized === 'SOFTCOVER' || normalized === 'SC') return 1;
  if (normalized === 'HARDCOVER' || normalized === 'HC') return 2;
  return 3;
};

const sortTier = (item: VariantSortable): number => {
  const variant = normalizeText(item.variant);
  if (variant !== '') return 4;
  return regularFormatRank(item.format);
};

const compareStableId = (left: unknown, right: unknown): number => {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const leftIsNumber = Number.isFinite(leftNumber);
  const rightIsNumber = Number.isFinite(rightNumber);

  if (leftIsNumber && rightIsNumber) return leftNumber - rightNumber;
  if (leftIsNumber) return -1;
  if (rightIsNumber) return 1;

  return normalizeText(left).localeCompare(normalizeText(right));
};

export const compareIssueVariants = (left: VariantSortable, right: VariantSortable): number => {
  const leftTier = sortTier(left);
  const rightTier = sortTier(right);
  if (leftTier !== rightTier) return leftTier - rightTier;

  const variantSort = naturalCompare(
    normalizeVariant(left.variant),
    normalizeVariant(right.variant),
  );
  if (variantSort !== 0) return variantSort;

  const formatSort = naturalCompare(normalizeVariant(left.format), normalizeVariant(right.format));
  if (formatSort !== 0) return formatSort;

  return compareStableId(left.id, right.id);
};

export const sortIssueVariants = <T extends VariantSortable>(issues: readonly T[]): T[] =>
  [...issues].sort(compareIssueVariants);

export const pickPreferredIssueVariant = <T extends VariantSortable>(
  issues: readonly T[],
): T | undefined => sortIssueVariants(issues)[0];
