"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.typeDef = void 0;
const graphql_tag_1 = __importDefault(require("graphql-tag"));
exports.typeDef = (0, graphql_tag_1.default) `
  extend type Mutation {
    login(user: UserInput!): User
    logout(user: UserInput!): Boolean
  }

  input UserInput {
    id: Int
    name: String
    password: String
    sessionid: String
  }

  type User {
    id: ID
    sessionid: String
  }
`;
