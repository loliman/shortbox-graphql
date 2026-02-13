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
        parent: async (parent, _, { storyLoader }) => {
            const fkParent = parent.fk_parent;
            if (typeof fkParent === 'number') {
                return await storyLoader.load(fkParent);
            }
            return null;
        },
        children: async (parent, _, { storyChildrenLoader }) => await storyChildrenLoader.load(parent.id),
        reprintOf: async (parent, _, { storyLoader }) => {
            const fkReprint = parent.fk_reprint;
            if (typeof fkReprint === 'number') {
                return await storyLoader.load(fkReprint);
            }
            return null;
        },
        reprints: async (parent, _, { storyReprintsLoader }) => await storyReprintsLoader.load(parent.id),
        issue: async (parent, _, { issueLoader }) => parent.Issue || (await issueLoader.load(parent.fk_issue)),
        individuals: async (parent) => parent.getIndividuals
            ? await parent.getIndividuals?.()
            : [],
        appearances: async (parent) => parent.getAppearances
            ? await parent.getAppearances?.()
            : [],
        exclusive: (parent) => !!(parent.onlyapp && parent.firstapp),
    },
};
