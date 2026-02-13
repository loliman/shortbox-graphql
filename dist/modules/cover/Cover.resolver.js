"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvers = void 0;
exports.resolvers = {
    Cover: {
        id: (parent, _, { loggedIn }) => {
            if (!loggedIn)
                return String(new Date().getTime());
            return String(parent.id);
        },
        parent: async (parent, _, { models }) => {
            const fkParent = parent.fk_parent;
            if (typeof fkParent === 'number') {
                return await models.Cover.findByPk(fkParent);
            }
            return null;
        },
        children: async (parent, _, { models }) => await models.Cover.findAll({ where: { fk_parent: parent.id } }),
        issue: async (parent, _, { issueLoader }) => parent.Issue || (await issueLoader.load(parent.fk_issue)),
        individuals: async (parent) => parent.getIndividuals
            ? await parent.getIndividuals?.()
            : [],
        onlyapp: async (parent, _, { models, issueLoader }) => {
            // Logik analog zum Original: Prüfen ob es eine US-Ausgabe ist
            const coverParent = parent;
            const issue = coverParent.Issue || (await issueLoader.load(coverParent.fk_issue));
            return (issue?.Series?.Publisher
                ?.original === true);
        },
        exclusive: (parent) => false, // Platzhalter für komplexere Logik falls benötigt
    },
};
