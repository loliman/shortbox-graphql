"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.typeDef = void 0;
const graphql_tag_1 = __importDefault(require("graphql-tag"));
exports.typeDef = (0, graphql_tag_1.default) `
  input StoryInput {
    number: Int!
    title: String
    parent: StoryInput
    reprintOf: StoryInput
    issue: IssueInput
    individuals: [IndividualInput]
    appearances: [AppearanceInput]
    onlyapp: Boolean
    firstapp: Boolean
    onlytb: Boolean
    otheronlytb: Boolean
    onlyoneprint: Boolean
    collected: Boolean
    addinfo: String
    part: String
    exclusive: Boolean
  }

  type Story {
    id: ID
    number: Int
    title: String
    parent: Story
    reprintOf: Story
    reprints: [Story]
    children: [Story]
    issue: Issue
    individuals: [Individual]
    appearances: [Appearance]
    onlyapp: Boolean
    firstapp: Boolean
    onlytb: Boolean
    otheronlytb: Boolean
    onlyoneprint: Boolean
    collected: Boolean
    addinfo: String
    part: String
    exclusive: Boolean
    collectedmultipletimes: Boolean
  }
`;
