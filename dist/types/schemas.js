"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilterSchema = exports.FeatureInputSchema = exports.CoverInputSchema = exports.StoryInputSchema = exports.ArcInputSchema = exports.AppearanceInputSchema = exports.UserInputSchema = exports.IndividualInputSchema = exports.IssueInputSchema = exports.SeriesInputSchema = exports.PublisherInputSchema = exports.NumberFilterSchema = exports.DateFilterSchema = void 0;
const zod_1 = require("zod");
exports.DateFilterSchema = zod_1.z.object({
    date: zod_1.z.string().or(zod_1.z.date()),
    compare: zod_1.z.string(),
});
exports.NumberFilterSchema = zod_1.z.object({
    number: zod_1.z.string(),
    compare: zod_1.z.string(),
    variant: zod_1.z.string().optional(),
});
exports.PublisherInputSchema = zod_1.z.object({
    id: zod_1.z.string().optional(),
    name: zod_1.z.string().min(1, 'Name ist erforderlich'),
    us: zod_1.z.boolean().optional(),
    addinfo: zod_1.z.string().optional(),
    startyear: zod_1.z.number().optional(),
    endyear: zod_1.z.number().optional().nullable(),
});
exports.SeriesInputSchema = zod_1.z.object({
    id: zod_1.z.string().optional(),
    title: zod_1.z.string().min(1, 'Titel ist erforderlich'),
    startyear: zod_1.z.number().optional(),
    endyear: zod_1.z.number().optional().nullable(),
    volume: zod_1.z.number().int().min(1, 'Volume muss mindestens 1 sein'),
    addinfo: zod_1.z.string().optional(),
    publisher: exports.PublisherInputSchema.optional(),
});
exports.IssueInputSchema = zod_1.z.object({
    id: zod_1.z.string().optional(),
    title: zod_1.z.string().optional(),
    number: zod_1.z.string().min(1, 'Nummer ist erforderlich'),
    format: zod_1.z.string().optional(),
    variant: zod_1.z.string().optional(),
    releasedate: zod_1.z.string().or(zod_1.z.date()).optional().nullable(),
    pages: zod_1.z.number().optional(),
    price: zod_1.z.number().optional(),
    currency: zod_1.z.string().optional(),
    isbn: zod_1.z.string().optional(),
    limitation: zod_1.z.string().optional(),
    addinfo: zod_1.z.string().optional(),
    series: exports.SeriesInputSchema.optional(),
});
exports.IndividualInputSchema = zod_1.z.object({
    id: zod_1.z.string().optional(),
    name: zod_1.z.string().min(1, 'Name ist erforderlich'),
});
exports.UserInputSchema = zod_1.z.object({
    id: zod_1.z.number().optional(),
    name: zod_1.z.string().min(1, 'Name ist erforderlich'),
    password: zod_1.z.string().min(1, 'Passwort ist erforderlich').optional(),
    sessionid: zod_1.z.string().optional(),
});
exports.AppearanceInputSchema = zod_1.z.object({
    id: zod_1.z.string().optional(),
    name: zod_1.z.string().min(1, 'Name ist erforderlich'),
    type: zod_1.z.string().optional(),
    role: zod_1.z.string().optional(),
});
exports.ArcInputSchema = zod_1.z.object({
    id: zod_1.z.string().optional(),
    title: zod_1.z.string().min(1, 'Titel ist erforderlich'),
    type: zod_1.z.string().optional(),
});
exports.StoryInputSchema = zod_1.z.lazy(() => zod_1.z.object({
    number: zod_1.z.number().int(),
    title: zod_1.z.string().optional(),
    parent: exports.StoryInputSchema.optional(),
    reprintOf: exports.StoryInputSchema.optional(),
    issue: exports.IssueInputSchema.optional(),
    individuals: zod_1.z.array(exports.IndividualInputSchema).optional(),
    appearances: zod_1.z.array(exports.AppearanceInputSchema).optional(),
    onlyapp: zod_1.z.boolean().optional(),
    firstapp: zod_1.z.boolean().optional(),
    onlytb: zod_1.z.boolean().optional(),
    otheronlytb: zod_1.z.boolean().optional(),
    onlyoneprint: zod_1.z.boolean().optional(),
    collected: zod_1.z.boolean().optional(),
    addinfo: zod_1.z.string().optional(),
    part: zod_1.z.string().optional(),
    exclusive: zod_1.z.boolean().optional(),
}));
exports.CoverInputSchema = zod_1.z.lazy(() => zod_1.z.object({
    number: zod_1.z.number().int(),
    parent: exports.CoverInputSchema.optional(),
    issue: exports.IssueInputSchema.optional(),
    individuals: zod_1.z.array(exports.IndividualInputSchema).optional(),
    addinfo: zod_1.z.string().optional(),
    exclusive: zod_1.z.boolean().optional(),
}));
exports.FeatureInputSchema = zod_1.z.object({
    id: zod_1.z.string().optional(),
    number: zod_1.z.number().int(),
    individuals: zod_1.z.array(exports.IndividualInputSchema).optional(),
    title: zod_1.z.string().optional(),
    addinfo: zod_1.z.string().optional(),
});
exports.FilterSchema = zod_1.z.object({
    us: zod_1.z.boolean(),
    formats: zod_1.z.array(zod_1.z.string()).optional(),
    withVariants: zod_1.z.boolean().optional(),
    releasedates: zod_1.z.array(exports.DateFilterSchema).optional(),
    publishers: zod_1.z.array(exports.PublisherInputSchema).optional(),
    series: zod_1.z.array(exports.SeriesInputSchema).optional(),
    numbers: zod_1.z.array(exports.NumberFilterSchema).optional(),
    arcs: zod_1.z.string().optional(),
    individuals: zod_1.z.array(exports.IndividualInputSchema).optional(),
    appearances: zod_1.z.string().optional(),
    firstPrint: zod_1.z.boolean().optional(),
    onlyPrint: zod_1.z.boolean().optional(),
    onlyTb: zod_1.z.boolean().optional(),
    exclusive: zod_1.z.boolean().optional(),
    reprint: zod_1.z.boolean().optional(),
    otherOnlyTb: zod_1.z.boolean().optional(),
    noPrint: zod_1.z.boolean().optional(),
    onlyOnePrint: zod_1.z.boolean().optional(),
    onlyCollected: zod_1.z.boolean().optional(),
    onlyNotCollected: zod_1.z.boolean().optional(),
    sellable: zod_1.z.boolean().optional(),
    noCover: zod_1.z.boolean().optional(),
    noContent: zod_1.z.boolean().optional(),
    and: zod_1.z.boolean().optional(),
});
