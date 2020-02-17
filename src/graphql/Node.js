import {gql} from 'apollo-server';
import models from "../models";

export const typeDef = gql`
  extend type Query {
    nodes(pattern: String!, us: Boolean!, offset: Int): [Node],
  }
    
  type Node {
    type: String,
    label: String,
    url: String,
  }
`;

export const resolvers = {
    Query: {
        nodes: async (_, {pattern, us, offset}) => {
            if (!offset)
                offset = 0;

            pattern = '%' + pattern.replace(/\s/g, '%') + '%';
            let res = await models.sequelize.query("SELECT type, \n" +
               "       Createlabel(type, name, title, volume, startyear, endyear, number, format, variant) AS label, \n" +
               "       Createurl(type, original, name, title, volume, number, format, variant) AS url \n" +
               "FROM   (SELECT \"publisher\" AS type, \n" +
               "               original    AS original, \n" +
               "               name        AS name, \n" +
               "               \"\"          AS title, \n" +
               "               0           AS volume, \n" +
               "               0           AS startyear, \n" +
               "               0           AS endyear, \n" +
               "               0           AS number, \n" +
               "               ''          AS format, \n" +
               "               ''          AS variant \n" +
               "        FROM   publisher p \n" +
               "        WHERE  original = 0 \n" +
               "        UNION \n" +
               "        SELECT \"series\"    AS type, \n" +
               "               original    AS original, \n" +
               "               name        AS name, \n" +
               "               s.title     AS title, \n" +
               "               volume      AS volume, \n" +
               "               s.startyear AS startyear, \n" +
               "               s.endyear   AS endyear, \n" +
               "               0           AS number, \n" +
               "               ''          AS format, \n" +
               "               ''          AS variant \n" +
               "        FROM   series s \n" +
               "               LEFT JOIN publisher p \n" +
               "                      ON s.fk_publisher = p.id \n" +
               "        WHERE  p.original = 0 \n" +
               "        UNION \n" +
               "        SELECT \"issue\"     AS type, \n" +
               "               original    AS original, \n" +
               "               name        AS name, \n" +
               "               s.title     AS title, \n" +
               "               volume      AS volume, \n" +
               "               s.startyear AS startyear, \n" +
               "               s.endyear   AS endyear, \n" +
               "               number      AS number, \n" +
               "               format      AS format, \n" +
               "               variant     AS variant \n" +
               "        FROM   issue i \n" +
               "               LEFT JOIN series s \n" +
               "                      ON i.fk_series = s.id \n" +
               "               LEFT JOIN publisher p \n" +
               "                      ON s.fk_publisher = p.id \n" +
               "        WHERE  p.original = 0 \n" +
               "        ORDER  BY title, \n" +
               "                  volume, \n" +
               "                  name, \n" +
               "                  Cast(number AS UNSIGNED), \n" +
               "                  format, \n" +
               "                  variant) a \n" +
               "HAVING label LIKE '" + pattern +"' \n" +
               "LIMIT  25 offset " + offset);

            return res[0];
        }
    },
    Node: {
        type: (parent) => parent.type,
        label: (parent) => parent.label,
        url: (parent) => parent.url
    }
};
