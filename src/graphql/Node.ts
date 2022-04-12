import {gql} from 'apollo-server';
import {knex} from '../core/database';

export class Node {
  type!: string;
  label!: string;
  url!: string;
}

export const typeDef = gql`
  extend type Query {
    nodes(pattern: String!, us: Boolean!, offset: Int): [Node]
  }

  type Node {
    type: String
    label: String
    url: String
  }
`;

export const resolvers = {
  Node: {
    type: (parent: Node): string => parent.type,
    label: (parent: Node): string => parent.label,
    url: (parent: Node): string => parent.url,
  },
  Query: {
    nodes: async (
      _: void,
      {pattern, us}: {pattern: string; us: boolean; offset: number}
    ) => {
      if (!pattern || pattern.trim() === '') return [];

      let query =
        'SELECT * FROM \n' +
        '(SELECT type, \n' +
        '       label, \n' +
        '       Createurl(type, us, name, title, volume, number, format, variant) AS url \n' +
        "FROM   ((SELECT Createlabel('publisher', name, '', 0, 0, 0, 0, '', '') as label, \n" +
        '               "publisher" AS type, \n' +
        '               us          AS us, \n' +
        '               name        AS name, \n' +
        '               ""          AS title, \n' +
        '               0           AS volume, \n' +
        '               0           AS startyear, \n' +
        '               0           AS endyear, \n' +
        '               0           AS number, \n' +
        "               ''          AS format, \n" +
        "               ''          AS variant \n" +
        '        FROM   publisher p \n' +
        '        WHERE  us = ' +
        (us ? 1 : 0) +
        ' \n' +
        "        HAVING label LIKE '%" +
        escapeSqlString(pattern).replace(/\s/g, '%') +
        "%' \n" +
        '        ORDER  BY label \n' +
        '        LIMIT 10) \n' +
        '        UNION \n' +
        "        (SELECT Createlabel('series', name, s.title, volume, s.startyear, s.endyear, 0, '', '') as label, \n" +
        '               "series"    AS type, \n' +
        '               us          AS us, \n' +
        '               name        AS name, \n' +
        '               s.title     AS title, \n' +
        '               volume      AS volume, \n' +
        '               s.startyear AS startyear, \n' +
        '               s.endyear   AS endyear, \n' +
        '               0           AS number, \n' +
        "               ''          AS format, \n" +
        "               ''          AS variant \n" +
        '        FROM   series s \n' +
        '               LEFT JOIN publisher p \n' +
        '                      ON s.fk_publisher = p.id \n' +
        '        WHERE  p.us = ' +
        (us ? 1 : 0) +
        ' \n' +
        "        HAVING label LIKE '%" +
        escapeSqlString(pattern).replace(/\s/g, '%') +
        "%' \n" +
        '        ORDER  BY label \n' +
        '        LIMIT 10) \n' +
        '        UNION \n' +
        "        (SELECT Createlabel('issue', name, s.title, volume, s.startyear, s.endyear, number, format, variant) as label, \n" +
        '               "issue"     AS type, \n' +
        '               us          AS us, \n' +
        '               name        AS name, \n' +
        '               s.title     AS title, \n' +
        '               volume      AS volume, \n' +
        '               s.startyear AS startyear, \n' +
        '               s.endyear   AS endyear, \n' +
        '               number      AS number, \n' +
        '               format      AS format, \n' +
        '               variant     AS variant \n' +
        '        FROM   issue i \n' +
        '               LEFT JOIN series s \n' +
        '                      ON i.fk_series = s.id \n' +
        '               LEFT JOIN publisher p \n' +
        '                      ON s.fk_publisher = p.id \n' +
        '        WHERE  p.us = ' +
        (us ? 1 : 0) +
        ' \n' +
        "        HAVING label LIKE '%" +
        escapeSqlString(pattern).replace(/\s/g, '%') +
        "%' \n" +
        '        ORDER  BY label \n' +
        '        LIMIT 10)) a \n' +
        ') a \n' +
        'ORDER BY \n' +
        "    CASE WHEN label LIKE '" +
        escapeSqlString(pattern) +
        "' THEN 1 \n" +
        "        WHEN label LIKE '" +
        escapeSqlString(pattern) +
        "%' THEN 2 \n" +
        "        WHEN label LIKE '%" +
        escapeSqlString(pattern) +
        "' THEN 4 \n" +
        '        ELSE 3 \n' +
        '    END ASC, label ASC';

      let res = await knex.raw(query);

      return res[0];
    },
  },
};

function escapeSqlString(s: string) {
  return s.replace("'", '%');
}
