"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvers = void 0;
exports.resolvers = {
    Feature: {
        id: (parent, _, { loggedIn }) => {
            if (!loggedIn)
                return String(new Date().getTime());
            return String(parent.id);
        },
        title: (parent) => parent.title.trim(),
        issue: async (parent, _, { issueLoader }) => parent.Issue ||
            (await issueLoader.load(parent.fk_issue)),
        individuals: async (parent) => parent.getIndividuals
            ? await parent.getIndividuals?.()
            : [],
    },
};
