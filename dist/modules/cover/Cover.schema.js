"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.typeDef = void 0;
const graphql_tag_1 = __importDefault(require("graphql-tag"));
exports.typeDef = (0, graphql_tag_1.default) `
  input CoverInput {
    number: Int!
    parent: CoverInput
    issue: IssueInput
    individuals: [IndividualInput]
    addinfo: String
    exclusive: Boolean
  }

  type Cover {
    id: ID
    url: String
    number: Int
    addinfo: String
    parent: Cover
    children: [Cover]
    onlyapp: Boolean
    firstapp: Boolean
    exclusive: Boolean
    issue: Issue
    individuals: [Individual]
  }
`;
