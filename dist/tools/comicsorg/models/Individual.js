"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = __importStar(require("sequelize"));
class Individual extends sequelize_1.Model {
    static associate(models) {
        Individual.belongsToMany(models.Story, {
            through: models.Story_Individual,
            foreignKey: 'creator_id',
        });
        Individual.belongsToMany(models.IndividualType, {
            through: models.Story_Individual,
            foreignKey: 'credit_type_id',
        });
    }
}
Individual.tableName = 'gcd_creator';
exports.default = (sequelize) => {
    Individual.init({
        id: {
            type: sequelize_1.default.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true,
        },
        gcd_official_name: {
            type: sequelize_1.default.STRING(255),
            allowNull: false,
        },
    }, {
        indexes: [
            {
                unique: true,
                fields: ['name'],
            },
        ],
        sequelize,
        tableName: Individual.tableName,
    });
    return Individual;
};
