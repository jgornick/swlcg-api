import _ from 'lodash';
import { Serializer } from 'jsonapi-serializer';
import { SQL_FIELDS as OBJECTIVE_SET_SQL_FIELDS } from '../struct/objective-set';
import { SQL_FIELDS as CARD_SQL_FIELDS } from '../struct/card';

const JSON_API_TYPE = 'objective-sets';

const SERIALIZER_DEFAULT_OPTIONS = {
    topLevelLinks: { self: '/objective-sets' },
    dataLinks: {
        'self': (record) => `/objective-sets/${record.objective_set_number}`
    },

    keyForAttribute: (attribute) => _.camelCase(attribute),
    typeForAttribute: (attribute) => _.kebabCase(attribute),

    attributes: [
        ...OBJECTIVE_SET_SQL_FIELDS,
        'matched_cards',
        'cards'
    ],

    cards: {
        ref: 'id',
        attributes: CARD_SQL_FIELDS,
        included: true,
        includedLinks: {
            self: (record, current) => `/cards/${current.number}`,
            related: (record, current) => `/objective-set/${record.objective_set_number}/cards/${current.objective_set_sequence}`
        },
        relationshipLinks: {
            self: (record, current, parent) => `/objective-sets/${record.objective_set_number}/relationships/cards`,
            related: (record, current, parent) => `/objective-sets/${record.objective_set_number}/cards`
        }
    }
};

export default class ObjectiveSetJsonApiSerializer {
    static serialize(cards, options = {}) {
        cards = _.map(cards, (card) => {
            if (card.id == null) {
                card.id = card.objective_set_number;
            }

            return card;
        });

        let serializer = new Serializer(
            JSON_API_TYPE,
            _.merge(SERIALIZER_DEFAULT_OPTIONS, options)
        );

        return serializer.serialize(cards);
    }
};
