import _ from 'lodash';
import { Serializer } from 'jsonapi-serializer';
import { SQL_FIELDS as OBJECTIVE_SET_SQL_FIELDS } from '../struct/objective-set';
import { SQL_FIELDS as CARD_SQL_FIELDS } from '../struct/card';

const JSON_API_TYPE = 'cards';

const SERIALIZER_DEFAULT_OPTIONS = {
    topLevelLinks: { self: '/cards' },
    dataLinks: {
        'self': (record) => `/cards/${record.number}`
    },

    keyForAttribute: (attribute) => _.camelCase(attribute),
    typeForAttribute: (attribute) => _.kebabCase(attribute),

    attributes: [
        ...CARD_SQL_FIELDS
    ]
};

export default class CardJsonApiSerializer {
    static serialize(cards, options = {}) {
        cards = _.map(cards, (card) => {
            if (card.id == null) {
                card.id = card.number;
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
