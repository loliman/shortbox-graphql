import { Op } from 'sequelize';
import { AppearanceResolvers } from '../../types/graphql';
import { buildConnectionFromNodes, decodeCursorId } from '../../core/cursor';

type AppearanceParent = {
  id: number;
  name: string;
  type: string;
  stories?: Array<{ id: number }>;
  story_appearance?: { role?: string | null };
};

type RealityNode = {
  id: number;
  name: string;
};

const REALITY_EXTRACT_PATTERN = /\((earth-[^)]+)\)/gi;

const normalizeRealityName = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.toLowerCase().startsWith('earth-')) {
    return `Earth-${trimmed.slice(6)}`;
  }
  return trimmed;
};

const extractRealitiesFromAppearanceName = (name: unknown): string[] => {
  const source = typeof name === 'string' ? name : '';
  if (!source) return [];

  const matches: string[] = [];
  let match: RegExpExecArray | null = REALITY_EXTRACT_PATTERN.exec(source);
  while (match) {
    const normalized = normalizeRealityName(match[1] || '');
    if (normalized) matches.push(normalized);
    match = REALITY_EXTRACT_PATTERN.exec(source);
  }
  REALITY_EXTRACT_PATTERN.lastIndex = 0;

  return matches;
};

export const resolvers: AppearanceResolvers = {
  Query: {
    apps: async (_, { pattern, type, first, after }, { models }) => {
      const limit = first || 50;
      const decodedCursor = decodeCursorId(after || undefined);

      const where: Record<string | symbol, unknown> = {};
      const order: Array<[string, 'ASC' | 'DESC']> = [
        ['name', 'ASC'],
        ['id', 'ASC'],
      ];

      if (decodedCursor) {
        const cursorRecord = await models.Appearance.findByPk(decodedCursor, {
          attributes: ['id', 'name'],
        });

        if (cursorRecord) {
          const cursorName = cursorRecord.get('name') as string | null;
          if (typeof cursorName === 'string') {
            where[Op.and] = [
              {
                [Op.or]: [
                  { name: { [Op.gt]: cursorName } },
                  { name: cursorName, id: { [Op.gt]: decodedCursor } },
                ],
              },
            ];
          } else {
            where[Op.and] = [{ id: { [Op.gt]: decodedCursor } }];
          }
        } else {
          where[Op.and] = [{ id: { [Op.gt]: decodedCursor } }];
        }
      }

      if (pattern && pattern !== '') {
        where.name = { [Op.iLike]: '%' + pattern.replace(/\s/g, '%') + '%' };
      }

      if (type) where.type = { [Op.iLike]: type.toUpperCase() };

      const results = await models.Appearance.findAll({
        where,
        order,
        limit: limit + 1,
      });
      return buildConnectionFromNodes(results, limit, after || undefined);
    },
    realities: async (_, { pattern, first, after }, { models }) => {
      const limit = first || 50;
      const decodedCursor = decodeCursorId(after || undefined);
      const normalizedPattern = String(pattern || '')
        .trim()
        .toLowerCase();

      const appearanceRows = await models.Appearance.findAll({
        attributes: ['name'],
      });

      const uniqueRealities = new Map<string, string>();
      appearanceRows.forEach((row) => {
        extractRealitiesFromAppearanceName(row.get('name')).forEach((reality) => {
          const key = reality.toLowerCase();
          if (!uniqueRealities.has(key)) uniqueRealities.set(key, reality);
        });
      });

      const sortedRealities = [...uniqueRealities.values()].sort((left, right) =>
        left.localeCompare(right, 'en', { numeric: true, sensitivity: 'base' }),
      );
      const filteredRealities =
        normalizedPattern.length === 0
          ? sortedRealities
          : sortedRealities.filter((reality) => reality.toLowerCase().includes(normalizedPattern));
      const nodes: RealityNode[] = filteredRealities.map((name, index) => ({
        id: index + 1,
        name,
      }));

      const startIndex = decodedCursor && decodedCursor > 0 ? decodedCursor : 0;
      const nodesWithOverflow = nodes.slice(startIndex, startIndex + limit + 1);
      const pagedNodes = nodesWithOverflow.map((node, index) => ({
        ...node,
        id: startIndex + index + 1,
      }));

      return buildConnectionFromNodes(pagedNodes, limit, after || undefined);
    },
  },
  Appearance: {
    id: (parent, _, { loggedIn }) => {
      const appearanceParent = parent as AppearanceParent;
      if (!loggedIn) return String(new Date().getTime());
      return String(appearanceParent.id);
    },
    name: (parent) => (parent as AppearanceParent).name.trim(),
    type: (parent) => {
      const appearanceParent = parent as AppearanceParent;
      return appearanceParent.type.trim() === '' ? 'CHARACTER' : appearanceParent.type;
    },
    role: async (parent, _, { models }) => {
      const appearanceParent = parent as AppearanceParent;
      if (appearanceParent.story_appearance) {
        return appearanceParent.story_appearance.role || '';
      }
      if (!appearanceParent.stories || appearanceParent.stories.length === 0) return '';
      let relation = await models.Story_Appearance.findOne({
        where: {
          fk_story: appearanceParent.stories[0].id,
          fk_appearance: appearanceParent.id,
        },
      });
      return relation ? (relation as { role?: string }).role || '' : '';
    },
  },
};
