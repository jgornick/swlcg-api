import _ from 'lodash';
import { Serializer } from 'jsonapi-serializer';
import { SQL_FIELDS as OBJECTIVE_SET_SQL_FIELDS } from '../struct/objective-set';
import { SQL_FIELDS as CARD_SQL_FIELDS } from '../struct/card';

const JSON_API_TYPE = 'cards';

const SERIALIZER_DEFAULT_OPTIONS = {
    keyForAttribute: (attribute) => _.camelCase(attribute),
    typeForAttribute: (attribute) => _.kebabCase(attribute),

    topLevelLinks: {
        self: (record) => `/cards`
    },

    dataLinks: {
        self: (record) => `/cards/${record.number}`
    },

    attributes: [
        ...CARD_SQL_FIELDS,
        'objectiveSets'
    ],

    objectiveSets: {
        ref: 'id',
        attributes: OBJECTIVE_SET_SQL_FIELDS,
        included: false,
        includedLinks: {
            self: (record, current) => `/objective-sets/${current.objective_set_number}`
        },
        relationshipLinks: {
            self: (record, current, parent) => `/cards/${record.number}/relationships/objective-sets`,
            related: (record, current, parent) => `/cards/${record.number}/objective-sets`
        }
    }
};

export default class CardJsonApiSerializer {
    static serialize(data, options = {}) {
        let serializer = new Serializer(
            JSON_API_TYPE,
            _.mergeWith(
                SERIALIZER_DEFAULT_OPTIONS,
                options,
                (objValue, srcValue) => {
                    if (_.isArray(objValue)) {
                        return srcValue;
                    }
                }
            )
        );

        return serializer.serialize(data);
    }
};
