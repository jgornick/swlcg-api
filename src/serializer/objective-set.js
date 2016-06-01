import _ from 'lodash';
import { Serializer } from 'jsonapi-serializer';
import { SQL_FIELDS as OBJECTIVE_SET_SQL_FIELDS } from '../struct/objective-set';
import { SQL_FIELDS as CARD_SQL_FIELDS } from '../struct/card';

const JSON_API_TYPE = 'objective-sets';

const SERIALIZER_DEFAULT_OPTIONS = {
    keyForAttribute: (attribute) => _.camelCase(attribute),
    typeForAttribute: (attribute) => _.kebabCase(attribute),

    topLevelLinks: {
        self: (record) => `/objective-sets`
    },

    dataLinks: {
        self: (record) => `/objective-sets/${record.objective_set_number}`
    },

    attributes: [
        ...OBJECTIVE_SET_SQL_FIELDS,
        'matched_cards',
        'stats',
        'cards'
    ],

    cards: {
        ref: 'id',
        attributes: CARD_SQL_FIELDS,
        included: false,
        includedLinks: {
            self: (record, current) => `/cards/${current.number}`
        },
        relationshipLinks: {
            self: (record, current, parent) => `/objective-sets/${record.objective_set_number}/relationships/cards`,
            related: (record, current, parent) => `/objective-sets/${record.objective_set_number}/cards`
        }
    }
};

export default class ObjectiveSetJsonApiSerializer {
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
