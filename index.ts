import { parse } from 'graphql/language/parser';
import { DocumentNode } from 'graphql';

// A map docString -> graphql document
let docCache: any = {};
// A map fragmentName -> [normalized source]
let fragmentSourceMap: any = {};
let printFragmentWarnings = true;
let experimentalFragmentVariables = false;

// For testing.
export const resetCaches = () => {
    docCache = {};
    fragmentSourceMap = {};
};

export const disableFragmentWarnings = () => {
    printFragmentWarnings = false;
};

export const enableExperimentalFragmentVariables = () => {
    experimentalFragmentVariables = true;
};

export const disableExperimentalFragmentVariables = () => {
    experimentalFragmentVariables = false;
};

export const gql = (literals: TemplateStringsArray, ...params: any[]): DocumentNode => {
    let result = literals[0];

    for (let i = 0; i < params.length; i++) {
        if (params[i] && params[i].kind && params[i].kind === 'Document') {
            result += params[i].loc.source.body;
        } else {
            result += params[i];
        }

        result += params[i];
    }

    return parseDocument(result) as DocumentNode;
};
export default gql;

// Strip insignificant whitespace
// Note that this could do a lot more, such as reorder fields etc.
const normalize = (string: string) => {
    return string.replace(/[\s,]+/g, ' ').trim();
};

const cacheKeyFromLoc = (loc: any) => {
    return normalize(loc.source.body.substring(loc.start, loc.end));
};

// Take a unstripped parsed document (query/mutation or even fragment), and
// check all fragment definitions, checking for name->source uniqueness.
// We also want to make sure only unique fragments exist in the document.
const processFragments = (ast: any) => {
    const astFragmentMap: any = {};
    const definitions = [];

    for (let i = 0; i < ast.definitions.length; i++) {
        const fragmentDefinition = ast.definitions[i];

        if (fragmentDefinition.kind === 'FragmentDefinition') {
            const fragmentName = fragmentDefinition.name.value;
            const sourceKey = cacheKeyFromLoc(fragmentDefinition.loc);

            // We know something about this fragment
            if (fragmentSourceMap.hasOwnProperty(fragmentName) && !fragmentSourceMap[fragmentName][sourceKey]) {

                // this is a problem because the app developer is trying to register another fragment with
                // the same name as one previously registered. So, we tell them about it.
                if (printFragmentWarnings) {
                    console.warn('Warning: fragment with name ' + fragmentName + ' already exists.\n'
                        + 'graphql-tag enforces all fragment names across your application to be unique; read more about\n'
                        + 'this in the docs: http://dev.apollodata.com/core/fragments.html#unique-names');
                }

                fragmentSourceMap[fragmentName][sourceKey] = true;

            } else if (!fragmentSourceMap.hasOwnProperty(fragmentName)) {
                fragmentSourceMap[fragmentName] = {};
                fragmentSourceMap[fragmentName][sourceKey] = true;
            }

            if (!astFragmentMap[sourceKey]) {
                astFragmentMap[sourceKey] = true;
                definitions.push(fragmentDefinition);
            }
        } else {
            definitions.push(fragmentDefinition);
        }
    }

    ast.definitions = definitions;
    return ast;
};
const stripLoc = (doc: any, removeLocAtThisLevel: any) => {
    const docType = Object.prototype.toString.call(doc);

    if (docType === '[object Array]') {
        return doc.map(function (d: any) {
            return stripLoc(d, removeLocAtThisLevel);
        });
    }

    if (docType !== '[object Object]') {
        throw new Error('Unexpected input.');
    }

    // We don't want to remove the root loc field so we can use it
    // for fragment substitution (see below)
    if (removeLocAtThisLevel && doc.loc) {
        delete doc.loc;
    }

    // https://github.com/apollographql/graphql-tag/issues/40
    if (doc.loc) {
        delete doc.loc.startToken;
        delete doc.loc.endToken;
    }

    const keys = Object.keys(doc);
    let key;
    let value;
    let valueType;

    for (key in keys) {
        if (keys.hasOwnProperty(key)) {
            value = doc[keys[key]];
            valueType = Object.prototype.toString.call(value);

            if (valueType === '[object Object]' || valueType === '[object Array]') {
                doc[keys[key]] = stripLoc(value, true);
            }
        }
    }

    return doc;
};

const parseDocument = (doc: any) => {
    const cacheKey = normalize(doc);

    if (docCache[cacheKey]) {
        return docCache[cacheKey];
    }

    let parsed = parse(doc, { experimentalFragmentVariables: experimentalFragmentVariables });
    if (!parsed || parsed.kind !== 'Document') {
        throw new Error('Not a valid GraphQL document.');
    }

    // check that all 'new' fragments inside the documents are consistent with
    // existing fragments of the same name
    parsed = processFragments(parsed);
    parsed = stripLoc(parsed, false);
    docCache[cacheKey] = parsed;

    return parsed;
};
