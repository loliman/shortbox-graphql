"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.typeDef = void 0;
const graphql_tag_1 = __importDefault(require("graphql-tag"));
exports.typeDef = (0, graphql_tag_1.default) `
  input FeatureInput {
    id: String
    number: Int!
    individuals: [IndividualInput]
    title: String
    addinfo: String
  }

  type Feature {
    id: ID
    title: String
    number: Int
    addinfo: String
    issue: Issue
    individuals: [Individual]
  }
`;
