"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvers = void 0;
exports.resolvers = {
    Story: {
        id: (parent, _, { loggedIn }) => {
            if (!loggedIn)
                return String(new Date().getTime());
            return String(parent.id);
        },
        parent: async (parent, _, { storyLoader }) => parent.fk_parent ? await storyLoader.load(parent.fk_parent) : null,
        children: async (parent, _, { models }) => await models.Story.findAll({ where: { fk_parent: parent.id } }),
        reprintOf: async (parent, _, { storyLoader }) => parent.fk_reprint ? await storyLoader.load(parent.fk_reprint) : null,
        reprints: async (parent, _, { models }) => await models.Story.findAll({ where: { fk_reprint: parent.id } }),
        issue: async (parent, _, { issueLoader }) => parent.Issue || (await issueLoader.load(parent.fk_issue)),
        individuals: async (parent) => parent.getIndividuals ? await parent.getIndividuals() : [],
        appearances: async (parent) => parent.getAppearances ? await parent.getAppearances() : [],
        exclusive: (parent) => !!(parent.onlyapp && parent.firstapp),
    },
};
